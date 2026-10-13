-- 008: chatbot de WhatsApp (Evolution API), status 'saiu' (entrega) e pagamento só com caixa aberto.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 007).

-- ---------- STATUS 'saiu' (saiu para entrega: entre pronto e entregue) ----------
alter type status_pedido add value if not exists 'saiu' after 'pronto';

-- ---------- PAGAMENTO SÓ COM CAIXA ABERTO ----------
-- Mesmo corpo da 007 + erro se não houver caixa aberto ao marcar pago (vale para update direto e fechar_comanda).
create or replace function public._pedido_caixa()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.pago then
    if tg_op = 'UPDATE' and old.pago then
      new.caixa_id := old.caixa_id;
      new.pago_em  := old.pago_em;
    else
      new.pago_em := now();
      select id into new.caixa_id from caixas where empresa_id = new.empresa_id and status = 'aberto';
      if new.caixa_id is null then raise exception 'Nenhum caixa aberto: abra o caixa para receber'; end if;
    end if;
  else
    if tg_op = 'UPDATE' and old.pago and old.caixa_id is not null
       and exists (select 1 from caixas where id = old.caixa_id and status = 'fechado') then
      raise exception 'Este pagamento já está num caixa fechado';
    end if;
    new.caixa_id := null;
    new.pago_em  := null;
  end if;
  return new;
end;
$$;

-- ---------- WHATSAPP ----------
-- Uma instância Evolution por empresa ("cardapio-{empresa_id}"). Escrita só pelo server (service role).
create table whatsapp_conexoes (
  empresa_id    uuid primary key references empresas(id) on delete cascade,
  instancia     text not null unique,
  status        text not null default 'desconectado'
                check (status in ('desconectado', 'aguardando_qr', 'conectado')),
  numero        text,
  conectado_em  timestamptz
);

create table bot_mensagens (
  empresa_id  uuid not null references empresas(id) on delete cascade,
  tipo        text not null check (tipo in ('boas_vindas', 'fazer_pedido', 'ausencia', 'horarios', 'promocoes', 'informacoes',
                                            'pedido_recebido', 'pedido_preparo', 'pedido_saiu', 'pedido_pronto_retirada',
                                            'pedido_cancelado')),
  texto       text not null,
  ativo       boolean not null default true,
  primary key (empresa_id, tipo)
);

create table bot_config (
  empresa_id                uuid primary key references empresas(id) on delete cascade,
  ia_ativa                  boolean not null default false,
  pausa_humano_minutos      integer not null default 30 check (pausa_humano_minutos between 0 and 1440),
  intervalo_saudacao_horas  integer not null default 12 check (intervalo_saudacao_horas between 0 and 720)
);

-- Estado por contato: saudação e pausa quando um atendente responde pelo celular.
create table bot_conversas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  telefone         text not null,
  ultimo_contato   timestamptz not null default now(),
  ultima_saudacao  timestamptz,
  pausado_ate      timestamptz,
  unique (empresa_id, telefone)
);

-- Idempotência: ids de mensagens já tratadas/enviadas e avisos de pedido já mandados.
-- shortcut: cresce sem limite; apagar linhas com mais de 7 dias (pg_cron) quando o volume pesar.
create table whatsapp_eventos (
  id          text primary key,
  created_at  timestamptz not null default now()
);

alter table whatsapp_conexoes enable row level security;
alter table bot_mensagens     enable row level security;
alter table bot_config        enable row level security;
alter table bot_conversas     enable row level security;   -- sem policy: só service role
alter table whatsapp_eventos  enable row level security;   -- sem policy: só service role

create policy "dono le conexao"      on whatsapp_conexoes for select using (e_membro(empresa_id, '{dono}'));
create policy "dono le mensagens"    on bot_mensagens     for select using (e_membro(empresa_id, '{dono}'));
create policy "dono edita mensagens" on bot_mensagens     for update using (e_membro(empresa_id, '{dono}'))
  with check (e_membro(empresa_id, '{dono}'));
create policy "dono le config bot"    on bot_config for select using (e_membro(empresa_id, '{dono}'));
create policy "dono edita config bot" on bot_config for update using (e_membro(empresa_id, '{dono}'))
  with check (e_membro(empresa_id, '{dono}'));
