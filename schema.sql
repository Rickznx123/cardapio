-- =====================================================================
-- CARDÁPIO DIGITAL — schema Supabase (multi-tenant)
-- Rodar inteiro no SQL Editor do Supabase.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ---------- ENUMS ----------
create type papel_membro  as enum ('dono', 'garcom', 'caixa');
create type tipo_pedido   as enum ('mesa', 'entrega', 'retirada');
create type status_pedido as enum ('novo', 'preparo', 'pronto', 'saiu', 'entregue', 'cancelado');  -- saiu: só entrega
create type status_comanda as enum ('aberta', 'fechada');
create type forma_pagamento as enum ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito');
create type origem_pedido as enum ('web', 'garcom', 'balcao');
create type status_caixa   as enum ('aberto', 'fechado');
create type tipo_movimento as enum ('sangria', 'suprimento');

-- ---------- TABELAS ----------
create table empresas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  slug             text not null unique             -- seudominio.com/slug
                   constraint empresas_slug_valido check (
                     slug ~ '^[a-z0-9-]{3,40}$'
                     and slug not in ('admin', 'login', 'api', 'balcao', 'garcom', 'pedido', 'painel', '_next', 'icons',
                                      'superadmin', 'termos', 'privacidade', 'redefinir-senha', 'cadastro', 'opengraph-image')
                   ),
  logo_url         text,
  capa_url         text,
  descricao        text,
  horario_texto    text,                            -- ex.: "Ter a Dom, 18h às 23h"
  cor_primaria     text default '#E11D48',
  whatsapp         text,                            -- 55DDDNUMERO
  endereco         text,
  aceita_entrega   boolean not null default true,
  aceita_retirada  boolean not null default true,
  aberto           boolean not null default true,   -- loja aberta p/ pedidos
  formas_pagamento text[] not null default '{dinheiro,pix,cartao_credito,cartao_debito}'
                   constraint empresas_formas_validas check (
                     cardinality(formas_pagamento) >= 1
                     and formas_pagamento <@ array['dinheiro', 'pix', 'cartao_credito', 'cartao_debito']
                   ),
  tempo_entrega_min integer check (tempo_entrega_min >= 0),   -- minutos
  tempo_entrega_max integer check (tempo_entrega_max >= 0),
  tempo_retirada    integer check (tempo_retirada >= 0),
  horarios         jsonb,                           -- {"sab": [{"abre": "18:30", "fecha": "02:00"}], ...} (fecha <= abre: dia seguinte; [] = fechado)
  virada_dia       time not null default '05:00',      -- fim do dia de trabalho (pedido 01:00 conta no dia anterior)
  plano_status     text not null default 'trial'
                   constraint empresas_plano_status check (plano_status in ('trial', 'ativo', 'vencido', 'cancelado')),
  trial_ate        timestamptz default now() + interval '3 days',
  origem_cadastro  text not null default 'superadmin'
                   constraint empresas_origem_cadastro check (origem_cadastro in ('self', 'superadmin')),
  config_impressao jsonb not null
                   default '{"largura": 80, "vias": 1, "via_cozinha_sem_precos": false, "cabecalho": "", "rodape": ""}',
  ativo            boolean not null default true,   -- assinatura ativa
  ultimo_pedido    integer not null default 0,      -- contador p/ nº do pedido
  created_at       timestamptz not null default now()
);

create table membros (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  papel       papel_membro not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (empresa_id, user_id)
);

create table categorias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  nome        text not null,
  ordem       integer not null default 0,
  ativo       boolean not null default true
);

create table itens (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  categoria_id  uuid not null references categorias(id) on delete cascade,
  nome          text not null,
  descricao     text,
  preco         numeric(10,2) not null check (preco >= 0),
  foto_url      text,
  disponivel    boolean not null default true,      -- false = esgotado
  destaque      boolean not null default false,     -- máx. 10 por empresa (trigger itens_limite_destaques)
  ordem         integer not null default 0,
  created_at    timestamptz not null default now()
);

create table bairros (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  nome           text not null,
  taxa           numeric(10,2) not null default 0 check (taxa >= 0),
  pedido_minimo  numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  ativo          boolean not null default true,
  unique (empresa_id, nome)
);

create table mesas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  numero      integer not null,
  ativo       boolean not null default true,
  unique (empresa_id, numero)
);

create table caixas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references empresas(id) on delete cascade,
  status              status_caixa not null default 'aberto',
  aberto_por          uuid references membros(id),
  aberto_em           timestamptz not null default now(),
  valor_inicial       numeric(10,2) not null default 0 check (valor_inicial >= 0),
  fechado_por         uuid references membros(id),
  fechado_em          timestamptz,
  valores_informados  jsonb,          -- {"dinheiro": 120.5, "pix": 300, ...} contados no fechamento
  valores_esperados   jsonb,          -- foto do esperado no fechamento (histórico não muda depois)
  observacao          text
);
-- só 1 caixa aberto por empresa
create unique index caixa_aberto_por_empresa on caixas (empresa_id) where status = 'aberto';
create index caixas_empresa_data on caixas (empresa_id, aberto_em desc);

create table caixa_movimentos (
  id          uuid primary key default gen_random_uuid(),
  caixa_id    uuid not null references caixas(id) on delete cascade,
  empresa_id  uuid not null references empresas(id) on delete cascade,
  tipo        tipo_movimento not null,
  valor       numeric(10,2) not null check (valor > 0),
  motivo      text,
  membro_id   uuid references membros(id),
  created_at  timestamptz not null default now()
);
create index caixa_movimentos_caixa on caixa_movimentos (caixa_id);

create table comandas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  mesa_id     uuid not null references mesas(id),
  status      status_comanda not null default 'aberta',
  total       numeric(10,2) not null default 0,
  aberta_em   timestamptz not null default now(),
  fechada_em  timestamptz
);
-- só 1 comanda aberta por mesa
create unique index comanda_aberta_por_mesa on comandas (mesa_id) where status = 'aberta';

create table pedidos (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references empresas(id) on delete cascade,
  numero            integer not null,               -- nº sequencial por empresa
  tipo              tipo_pedido not null,
  status            status_pedido not null default 'novo',
  comanda_id        uuid references comandas(id),
  membro_id         uuid references membros(id),    -- garçom que lançou
  cliente_nome      text,
  cliente_telefone  text,
  cancelamento_motivo text,
  endereco          text,
  bairro_id         uuid references bairros(id),
  bairro_nome       text,                           -- snapshot
  taxa_entrega      numeric(10,2) not null default 0,
  subtotal          numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  observacao        text,
  impresso_em       timestamptz,
  aceite_pendente   boolean not null default false,
  forma_pagamento   forma_pagamento,
  troco_para        numeric(10,2) check (troco_para is null or troco_para >= 0),
  pago              boolean not null default false,
  pago_em           timestamptz,
  aceito_em         timestamptz,
  origem            origem_pedido not null default 'web',
  caixa_id          uuid references caixas(id),       -- caixa em que foi recebido (trigger pedidos_caixa)
  created_at        timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index pedidos_empresa_status on pedidos (empresa_id, status, created_at desc);
create index pedidos_caixa on pedidos (caixa_id);
create index pedidos_empresa_data on pedidos (empresa_id, created_at desc);

create table pedido_itens (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references pedidos(id) on delete cascade,
  empresa_id   uuid not null references empresas(id) on delete cascade,
  item_id      uuid references itens(id) on delete set null,
  nome         text not null,                       -- snapshot
  preco        numeric(10,2) not null,              -- snapshot
  quantidade   integer not null check (quantidade > 0),
  observacao   text
);

-- ---------- LIMITE DE DESTAQUES ----------
-- Máx. 10 itens em destaque por empresa. Trava a linha da empresa para duas edições simultâneas
-- não passarem juntas do limite.
create or replace function public._limite_destaques()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.destaque and (tg_op = 'INSERT' or not old.destaque or old.empresa_id <> new.empresa_id) then
    perform 1 from empresas where id = new.empresa_id for update;
    if (select count(*) from itens where empresa_id = new.empresa_id and destaque and id <> new.id) >= 10 then
      raise exception 'Máximo de 10 itens em destaque';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public._limite_destaques() from public, anon, authenticated;

create trigger itens_limite_destaques
  before insert or update of destaque, empresa_id on itens
  for each row execute function public._limite_destaques();

-- ---------- HELPER DE PERMISSÃO ----------
create or replace function public.e_membro(p_empresa uuid, p_papeis papel_membro[] default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from membros m
    where m.empresa_id = p_empresa
      and m.user_id = auth.uid()
      and m.ativo
      and (p_papeis is null or m.papel = any (p_papeis))
  );
$$;

-- ---------- PLANO / TRIAL ----------
-- Liberada = não desativada pelo super admin e (plano ativo ou trial no prazo).
create or replace function public.empresa_liberada(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = public
as $
  select coalesce((
    select ativo and (plano_status = 'ativo' or (plano_status = 'trial' and trial_ate > now()))
    from empresas where id = p_empresa
  ), false);
$;
grant execute on function public.empresa_liberada(uuid) to anon, authenticated;

-- Pedido novo só em empresa liberada (vale para web, balcão e garçom: todas as RPCs inserem em pedidos).
create or replace function public._pedido_empresa_liberada()
returns trigger
language plpgsql security definer set search_path = public
as $
begin
  if not empresa_liberada(new.empresa_id) then raise exception 'Loja indisponível no momento'; end if;
  return new;
end;
$;
revoke all on function public._pedido_empresa_liberada() from public, anon, authenticated;
create trigger pedidos_empresa_liberada before insert on pedidos
  for each row execute function public._pedido_empresa_liberada();

-- ---------- RLS ----------
alter table empresas     enable row level security;
alter table membros      enable row level security;
alter table categorias   enable row level security;
alter table itens        enable row level security;
alter table bairros      enable row level security;
alter table mesas        enable row level security;
alter table comandas     enable row level security;
alter table pedidos      enable row level security;
alter table pedido_itens enable row level security;
alter table caixas           enable row level security;
alter table caixa_movimentos enable row level security;
-- Leitura para dono/caixa. Escrita só pelas RPCs abaixo (security definer).
create policy "caixa le caixas"     on caixas           for select using (e_membro(empresa_id, '{dono,caixa}'));
create policy "caixa le movimentos" on caixa_movimentos for select using (e_membro(empresa_id, '{dono,caixa}'));


-- Leitura pública do cardápio
create policy "publico le empresas"   on empresas   for select using (ativo or e_membro(id));
create policy "publico le categorias" on categorias for select using (ativo or e_membro(empresa_id));
create policy "publico le itens"      on itens      for select using (true);
create policy "publico le bairros"    on bairros    for select using (ativo or e_membro(empresa_id));

-- Dono gerencia cadastro
create policy "dono edita empresa"    on empresas   for update using (e_membro(id, '{dono}'));
create policy "dono gerencia categ"   on categorias for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));
create policy "dono gerencia itens"   on itens      for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));
create policy "dono gerencia bairros" on bairros    for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));
create policy "dono gerencia mesas"   on mesas      for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));
create policy "dono gerencia membros" on membros    for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));

-- Equipe (dono, garçom, caixa) lê operação
create policy "equipe le membros"   on membros      for select using (e_membro(empresa_id));
create policy "equipe le mesas"     on mesas        for select using (e_membro(empresa_id));
create policy "equipe le comandas"  on comandas     for select using (e_membro(empresa_id));
create policy "equipe le pedidos"   on pedidos      for select using (e_membro(empresa_id));
create policy "equipe le itens ped" on pedido_itens for select using (e_membro(empresa_id));

-- Caixa/dono atualizam status, impressão e fecham comanda
-- Cancelar só pela RPC cancelar_pedido (security definer), que também desconta da comanda.
create policy "caixa atualiza pedidos"  on pedidos  for update using (e_membro(empresa_id, '{dono,caixa}'))
  with check (e_membro(empresa_id, '{dono,caixa}') and status <> 'cancelado');
create policy "caixa atualiza comandas" on comandas for update using (e_membro(empresa_id, '{dono,caixa}'));

-- Inserção de pedidos SÓ via RPC (preços calculados no servidor).
-- Não existe policy de insert em pedidos/pedido_itens/comandas de propósito.

-- ---------- RPCs DE PEDIDO ----------

-- Interna: adiciona itens ao pedido e devolve subtotal. p_itens = [{item_id, quantidade, observacao}]
create or replace function public._adicionar_itens(p_pedido uuid, p_empresa uuid, p_itens jsonb)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_el    jsonb;
  v_item  itens%rowtype;
  v_qtd   integer;
  v_sub   numeric(10,2) := 0;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens';
  end if;

  for v_el in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_el->>'quantidade')::integer, 1);
    if v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;

    select * into v_item from itens
    where id = (v_el->>'item_id')::uuid and empresa_id = p_empresa;

    if not found then raise exception 'Item não encontrado'; end if;
    if not v_item.disponivel then raise exception 'Item esgotado: %', v_item.nome; end if;

    insert into pedido_itens (pedido_id, empresa_id, item_id, nome, preco, quantidade, observacao)
    values (p_pedido, p_empresa, v_item.id, v_item.nome, v_item.preco, v_qtd, nullif(v_el->>'observacao', ''));

    v_sub := v_sub + v_item.preco * v_qtd;
  end loop;

  return v_sub;
end;
$$;
revoke all on function public._adicionar_itens(uuid, uuid, jsonb) from public, anon, authenticated;

-- Interna: valida e cria pedido de entrega/retirada (web ou balcão). Preço sempre do banco.
create or replace function public._criar_pedido_externo(
  p_empresa          uuid,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text,
  p_cliente_telefone text,
  p_endereco         text,
  p_bairro_id        uuid,
  p_observacao       text,
  p_forma            forma_pagamento,
  p_troco_para       numeric,
  p_origem           origem_pedido,
  p_exige_cliente    boolean
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_bairro  bairros%rowtype;
  v_numero  integer;
  v_pedido  uuid;
  v_sub     numeric(10,2);
  v_taxa    numeric(10,2) := 0;
begin
  if p_tipo = 'mesa' then raise exception 'Tipo inválido'; end if;
  if p_exige_cliente and (coalesce(trim(p_cliente_nome), '') = '' or coalesce(trim(p_cliente_telefone), '') = '') then
    raise exception 'Informe nome e telefone';
  end if;
  if p_forma is not null and not exists (
    select 1 from empresas where id = p_empresa and p_forma::text = any(formas_pagamento)
  ) then
    raise exception 'Forma de pagamento não aceita por esta loja';
  end if;
  if p_troco_para is not null and p_forma is distinct from 'dinheiro' then
    raise exception 'Troco só vale para pagamento em dinheiro';
  end if;

  if p_tipo = 'entrega' then
    select * into v_bairro from bairros where id = p_bairro_id and empresa_id = p_empresa and ativo;
    if not found then raise exception 'Bairro não atendido'; end if;
    if coalesce(trim(p_endereco), '') = '' then raise exception 'Informe o endereço'; end if;
    v_taxa := v_bairro.taxa;
  end if;

  update empresas set ultimo_pedido = ultimo_pedido + 1 where id = p_empresa returning ultimo_pedido into v_numero;

  insert into pedidos (empresa_id, numero, tipo, cliente_nome, cliente_telefone, endereco, bairro_id, bairro_nome,
                       taxa_entrega, observacao, forma_pagamento, troco_para, origem)
  values (p_empresa, v_numero, p_tipo, nullif(trim(p_cliente_nome), ''), nullif(trim(p_cliente_telefone), ''),
          case when p_tipo = 'entrega' then trim(p_endereco) end, v_bairro.id, v_bairro.nome,
          v_taxa, nullif(trim(p_observacao), ''), p_forma, p_troco_para, p_origem)
  returning id into v_pedido;

  v_sub := _adicionar_itens(v_pedido, p_empresa, p_itens);

  if p_tipo = 'entrega' and v_sub < v_bairro.pedido_minimo then
    raise exception 'Pedido mínimo para este bairro: R$ %', v_bairro.pedido_minimo;
  end if;
  if p_troco_para is not null and p_troco_para < v_sub + v_taxa then
    raise exception 'O troco deve ser para um valor maior ou igual ao total (R$ %)', v_sub + v_taxa;
  end if;

  update pedidos set subtotal = v_sub, total = v_sub + v_taxa where id = v_pedido;

  return json_build_object('id', v_pedido, 'numero', v_numero, 'subtotal', v_sub,
                           'taxa_entrega', v_taxa, 'total', v_sub + v_taxa);
end;
$$;
revoke all on function public._criar_pedido_externo(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, origem_pedido, boolean)
  from public, anon, authenticated;

-- Pedido do cardápio público: agora exige forma de pagamento (troco opcional, só dinheiro).
create or replace function public.criar_pedido_publico(
  p_slug             text,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text,
  p_cliente_telefone text,
  p_forma_pagamento  forma_pagamento,
  p_endereco         text default null,
  p_bairro_id        uuid default null,
  p_observacao       text default null,
  p_troco_para       numeric default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_emp empresas%rowtype;
  v_pedido json;
begin
  select * into v_emp from empresas where slug = p_slug and ativo;
  if not found then raise exception 'Empresa não encontrada'; end if;
  if not v_emp.aberto then raise exception 'Loja fechada no momento'; end if;
  if p_forma_pagamento is null then raise exception 'Informe a forma de pagamento'; end if;
  if p_tipo = 'entrega' and not v_emp.aceita_entrega then raise exception 'Empresa não faz entrega'; end if;
  if p_tipo = 'retirada' and not v_emp.aceita_retirada then raise exception 'Empresa não aceita retirada'; end if;

  return _criar_pedido_externo(v_emp.id, p_tipo, p_itens, p_cliente_nome, p_cliente_telefone, p_endereco,
                               p_bairro_id, p_observacao, p_forma_pagamento, p_troco_para, 'web', true);
end;
$$;
grant execute on function public.criar_pedido_publico(text, tipo_pedido, jsonb, text, text, forma_pagamento, text, uuid, text, numeric)
  to anon, authenticated;

-- Pedido lançado no painel (dono/caixa): retirada (cliente opcional) ou entrega (cliente obrigatório).
-- Não checa loja aberta nem aceita_entrega/retirada: é a equipe lançando (ex.: pedido por telefone).
create or replace function public.criar_pedido_balcao(
  p_empresa_id       uuid,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text default null,
  p_cliente_telefone text default null,
  p_endereco         text default null,
  p_bairro_id        uuid default null,
  p_observacao       text default null,
  p_forma_pagamento  forma_pagamento default null,
  p_troco_para       numeric default null
)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not e_membro(p_empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  return _criar_pedido_externo(p_empresa_id, p_tipo, p_itens, p_cliente_nome, p_cliente_telefone, p_endereco,
                               p_bairro_id, p_observacao, p_forma_pagamento, p_troco_para, 'balcao',
                               p_tipo = 'entrega');
end;
$$;
grant execute on function public.criar_pedido_balcao(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric)
  to authenticated;

-- Pedido do garçom (mesa). Abre comanda se não houver.
create or replace function public.criar_pedido_mesa(
  p_mesa_id     uuid,
  p_itens       jsonb,
  p_observacao  text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_mesa     mesas%rowtype;
  v_membro   uuid;
  v_comanda  uuid;
  v_numero   integer;
  v_pedido   uuid;
  v_sub      numeric(10,2);
begin
  select * into v_mesa from mesas where id = p_mesa_id and ativo;
  if not found then raise exception 'Mesa não encontrada'; end if;

  select id into v_membro from membros
  where empresa_id = v_mesa.empresa_id and user_id = auth.uid() and ativo;
  if v_membro is null then raise exception 'Sem permissão'; end if;

  select id into v_comanda from comandas where mesa_id = v_mesa.id and status = 'aberta';
  if v_comanda is null then
    insert into comandas (empresa_id, mesa_id) values (v_mesa.empresa_id, v_mesa.id)
    returning id into v_comanda;
  end if;

  update empresas set ultimo_pedido = ultimo_pedido + 1 where id = v_mesa.empresa_id
  returning ultimo_pedido into v_numero;

  insert into pedidos (empresa_id, numero, tipo, comanda_id, membro_id, observacao, origem)
  values (v_mesa.empresa_id, v_numero, 'mesa', v_comanda, v_membro, nullif(p_observacao, ''), 'garcom')
  returning id into v_pedido;

  v_sub := _adicionar_itens(v_pedido, v_mesa.empresa_id, p_itens);

  update pedidos  set subtotal = v_sub, total = v_sub where id = v_pedido;
  update comandas set total = total + v_sub where id = v_comanda;

  return json_build_object('id', v_pedido, 'numero', v_numero, 'comanda_id', v_comanda, 'total', v_sub);
end;
$$;
grant execute on function public.criar_pedido_mesa(uuid, jsonb, text) to authenticated;

-- Fecha a comanda e marca como pagos os pedidos dela (não cancelados), numa transação só.
create or replace function public.fechar_comanda(p_comanda_id uuid, p_forma_pagamento forma_pagamento)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_com comandas%rowtype;
begin
  select * into v_com from comandas where id = p_comanda_id for update;
  if not found then raise exception 'Comanda não encontrada'; end if;
  if not e_membro(v_com.empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  if v_com.status <> 'aberta' then raise exception 'Comanda já fechada'; end if;
  if p_forma_pagamento is null then raise exception 'Informe a forma de pagamento'; end if;

  update pedidos set pago = true, pago_em = now(), forma_pagamento = p_forma_pagamento
  where comanda_id = p_comanda_id and status <> 'cancelado' and not pago;

  update comandas set status = 'fechada', fechada_em = now() where id = p_comanda_id;
end;
$$;
grant execute on function public.fechar_comanda(uuid, forma_pagamento) to authenticated;

-- Tela de login do garçom (/[slug]/garcom): lista só id e nome, sem e-mail.
create or replace function public.listar_garcons(p_slug text)
returns table (id uuid, nome text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.nome
  from membros m join empresas e on e.id = m.empresa_id
  where e.slug = p_slug and empresa_liberada(e.id) and m.ativo and m.papel = 'garcom'
  order by m.nome;
$$;
grant execute on function public.listar_garcons(text) to anon, authenticated;

-- Acompanhamento do pedido pelo cliente (/[slug]/pedido/[id]). Sem telefone/endereço; só pedidos não-mesa
-- e só se o pedido for da empresa do slug (evita exibir o pedido com a marca de outra loja).
create or replace function public.ver_pedido_publico(p_slug text, p_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'numero', p.numero, 'tipo', p.tipo,
    'status', case when p.aceite_pendente then 'aguardando_aceite' else p.status::text end,
    'bairro_nome', p.bairro_nome,
    'taxa', p.taxa_entrega, 'subtotal', p.subtotal, 'total', p.total, 'created_at', p.created_at,
    'forma_pagamento', p.forma_pagamento, 'troco_para', p.troco_para, 'pago', p.pago,
    'itens', coalesce((
      select json_agg(json_build_object('nome', i.nome, 'preco', i.preco,
                                        'quantidade', i.quantidade, 'observacao', i.observacao))
      from pedido_itens i where i.pedido_id = p.id
    ), '[]'::json)
  )
  from pedidos p join empresas e on e.id = p.empresa_id
  where p.id = p_id and e.slug = p_slug and p.tipo <> 'mesa';
$$;
grant execute on function public.ver_pedido_publico(text, uuid) to anon, authenticated;

-- Cancela pedido (dono/caixa) e tira o valor da comanda aberta, se for de mesa.
create or replace function public.cancelar_pedido(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ped pedidos%rowtype;
begin
  select * into v_ped from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not e_membro(v_ped.empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  if v_ped.status = 'cancelado' then return; end if;

  if v_ped.comanda_id is not null then
    update comandas set total = greatest(total - v_ped.total, 0)
    where id = v_ped.comanda_id and status = 'aberta';
    if not found then raise exception 'Comanda já fechada'; end if;
  end if;

  update pedidos set status = 'cancelado' where id = p_id;
end;
$$;
grant execute on function public.cancelar_pedido(uuid) to authenticated;

-- Só o painel (ou o agendador) pode aceitar/recusar pedidos públicos pendentes.
create or replace function public.aceitar_pedido(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_ped pedidos%rowtype;
begin
  select * into v_ped from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not e_membro(v_ped.empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  if v_ped.origem <> 'web' or v_ped.tipo not in ('entrega', 'retirada') then
    raise exception 'Somente pedidos web de entrega ou retirada podem ser aceitos por esta ação';
  end if;
  if not v_ped.aceite_pendente then return false; end if;

  update pedidos set status = 'preparo', aceite_pendente = false, aceito_em = now() where id = p_id;
  return true;
end;
$$;
grant execute on function public.aceitar_pedido(uuid) to authenticated;

create or replace function public.recusar_pedido(p_id uuid, p_motivo text default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_ped pedidos%rowtype;
begin
  select * into v_ped from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not e_membro(v_ped.empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  if v_ped.origem <> 'web' or v_ped.tipo not in ('entrega', 'retirada') then
    raise exception 'Somente pedidos web de entrega ou retirada podem ser recusados por esta ação';
  end if;
  if not v_ped.aceite_pendente then return false; end if;

  if v_ped.cupom_id is not null then
    update cupons set usos = greatest(usos - 1, 0) where id = v_ped.cupom_id;
    update recuperador_envios set convertido_pedido_id = null where convertido_pedido_id = p_id;
  end if;

  update pedidos
  set status = 'cancelado', aceite_pendente = false, cancelamento_motivo = nullif(trim(p_motivo), '')
  where id = p_id;
  return true;
end;
$$;
grant execute on function public.recusar_pedido(uuid, text) to authenticated;

create or replace function public.aceitar_pedidos_expirados()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_quantidade integer;
begin
  update pedidos
  set status = 'preparo', aceite_pendente = false, aceito_em = now()
  where aceite_pendente
    and origem = 'web'
    and tipo in ('entrega', 'retirada')
    and created_at <= now() - interval '5 minutes';
  get diagnostics v_quantidade = row_count;
  return v_quantidade;
end;
$$;
revoke all on function public.aceitar_pedidos_expirados() from public, anon, authenticated;

select cron.schedule(
  'aceitar-pedidos-expirados',
  '* * * * *',
  'select public.aceitar_pedidos_expirados();'
);

-- ---------- CAIXA, RELATÓRIO, LOJA, REORDENAR (007) ----------
-- Ao marcar pago, exige caixa aberto, liga o pedido a ele e grava pago_em com a hora do servidor.
-- Ao desmarcar, solta. Já pago: caixa_id/pago_em não mudam (nem por update direto do client).
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
revoke all on function public._pedido_caixa() from public, anon, authenticated;
create trigger pedidos_caixa before insert or update on pedidos
  for each row execute function public._pedido_caixa();

-- ---------- HELPERS ----------
-- Membro (dono/caixa) logado na empresa, ou erro.
create or replace function public._membro_caixa(p_empresa uuid)
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_membro uuid;
begin
  select id into v_membro from membros
  where empresa_id = p_empresa and user_id = auth.uid() and ativo and papel in ('dono', 'caixa');
  if v_membro is null then raise exception 'Sem permissão'; end if;
  return v_membro;
end;
$$;
revoke all on function public._membro_caixa(uuid) from public, anon, authenticated;

-- Resumo de um caixa: entradas por forma (pedidos pagos, não cancelados), sangrias, suprimentos e esperado.
-- Dinheiro esperado = valor inicial + vendas em dinheiro + suprimentos − sangrias.
create or replace function public._resumo_caixa(p_caixa uuid)
returns json
language sql stable security definer set search_path = public
as $$
  with c as (select * from caixas where id = p_caixa),
  entradas as (
    select p.forma_pagamento::text as forma, sum(p.total) as valor, count(*) as pedidos
    from pedidos p where p.caixa_id = p_caixa and p.pago and p.status <> 'cancelado'
    group by 1
  ),
  mov as (
    select coalesce(sum(valor) filter (where tipo = 'sangria'), 0)    as sangrias,
           coalesce(sum(valor) filter (where tipo = 'suprimento'), 0) as suprimentos
    from caixa_movimentos where caixa_id = p_caixa
  )
  select json_build_object(
    'caixa', (select row_to_json(c) from c),
    'aberto_por_nome',  (select m.nome from membros m join c on m.id = c.aberto_por),
    'fechado_por_nome', (select m.nome from membros m join c on m.id = c.fechado_por),
    'entradas', coalesce((select json_object_agg(coalesce(forma, 'a_definir'), valor) from entradas), '{}'::json),
    'qtd_pedidos', coalesce((select sum(pedidos) from entradas), 0),
    'total_vendas', coalesce((select sum(valor) from entradas), 0),
    'sangrias', (select sangrias from mov),
    'suprimentos', (select suprimentos from mov),
    'esperado', coalesce((select valores_esperados::json from c), json_build_object(
      'dinheiro', (select valor_inicial from c) + coalesce((select valor from entradas where forma = 'dinheiro'), 0)
                  + (select suprimentos from mov) - (select sangrias from mov),
      'pix', coalesce((select valor from entradas where forma = 'pix'), 0),
      'cartao_credito', coalesce((select valor from entradas where forma = 'cartao_credito'), 0),
      'cartao_debito', coalesce((select valor from entradas where forma = 'cartao_debito'), 0)
    )),
    'movimentos', coalesce((
      select json_agg(json_build_object('id', mv.id, 'tipo', mv.tipo, 'valor', mv.valor, 'motivo', mv.motivo,
                                        'created_at', mv.created_at, 'membro', m.nome) order by mv.created_at)
      from caixa_movimentos mv left join membros m on m.id = mv.membro_id
      where mv.caixa_id = p_caixa
    ), '[]'::json)
  );
$$;
revoke all on function public._resumo_caixa(uuid) from public, anon, authenticated;

-- ---------- RPCs DE CAIXA (dono/caixa) ----------
create or replace function public.abrir_caixa(p_empresa_id uuid, p_valor_inicial numeric default 0)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_membro uuid := _membro_caixa(p_empresa_id);
  v_caixa  uuid;
begin
  if coalesce(p_valor_inicial, 0) < 0 then raise exception 'Valor inicial inválido'; end if;
  insert into caixas (empresa_id, aberto_por, valor_inicial)
  values (p_empresa_id, v_membro, coalesce(p_valor_inicial, 0))
  returning id into v_caixa;
  return v_caixa;
exception when unique_violation then
  raise exception 'Já existe um caixa aberto';
end;
$$;
grant execute on function public.abrir_caixa(uuid, numeric) to authenticated;

create or replace function public.registrar_movimento(p_empresa_id uuid, p_tipo tipo_movimento, p_valor numeric, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_membro uuid := _membro_caixa(p_empresa_id);
  v_caixa  uuid;
  v_id     uuid;
begin
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  select id into v_caixa from caixas where empresa_id = p_empresa_id and status = 'aberto';
  if v_caixa is null then raise exception 'Nenhum caixa aberto'; end if;
  insert into caixa_movimentos (caixa_id, empresa_id, tipo, valor, motivo, membro_id)
  values (v_caixa, p_empresa_id, p_tipo, p_valor, nullif(trim(p_motivo), ''), v_membro)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.registrar_movimento(uuid, tipo_movimento, numeric, text) to authenticated;

-- Fecha o caixa aberto. Devolve esperado × informado × diferença por forma de pagamento.
create or replace function public.fechar_caixa(p_empresa_id uuid, p_valores_informados jsonb, p_observacao text default null)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_membro   uuid := _membro_caixa(p_empresa_id);
  v_caixa    uuid;
  v_resumo   json;
  v_esperado jsonb;
  v_dif      jsonb := '{}';
  v_forma    text;
begin
  select id into v_caixa from caixas where empresa_id = p_empresa_id and status = 'aberto' for update;
  if v_caixa is null then raise exception 'Nenhum caixa aberto'; end if;
  if p_valores_informados is null or jsonb_typeof(p_valores_informados) <> 'object' then
    raise exception 'Informe os valores contados';
  end if;

  v_resumo   := _resumo_caixa(v_caixa);
  v_esperado := (v_resumo -> 'esperado')::jsonb;
  for v_forma in select jsonb_object_keys(v_esperado) loop
    v_dif := v_dif || jsonb_build_object(v_forma,
      coalesce((p_valores_informados ->> v_forma)::numeric, 0) - (v_esperado ->> v_forma)::numeric);
  end loop;

  update caixas set status = 'fechado', fechado_por = v_membro, fechado_em = now(),
                    valores_informados = p_valores_informados, valores_esperados = v_esperado,
                    observacao = nullif(trim(p_observacao), '')
  where id = v_caixa;

  return json_build_object('caixa_id', v_caixa, 'esperado', v_esperado,
                           'informado', p_valores_informados, 'diferenca', v_dif,
                           'resumo', _resumo_caixa(v_caixa));
end;
$$;
grant execute on function public.fechar_caixa(uuid, jsonb, text) to authenticated;

create or replace function public.resumo_caixa(p_caixa_id uuid)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_emp uuid;
begin
  select empresa_id into v_emp from caixas where id = p_caixa_id;
  if v_emp is null then raise exception 'Caixa não encontrado'; end if;
  perform _membro_caixa(v_emp);
  return _resumo_caixa(p_caixa_id);
end;
$$;
grant execute on function public.resumo_caixa(uuid) to authenticated;

-- ---------- LOJA ABERTA/FECHADA (dono e caixa) ----------
create or replace function public.alternar_loja(p_empresa_id uuid, p_aberto boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  perform _membro_caixa(p_empresa_id);
  update empresas set aberto = p_aberto where id = p_empresa_id;
  return p_aberto;
end;
$$;
grant execute on function public.alternar_loja(uuid, boolean) to authenticated;

-- ---------- REORDENAR (drag-and-drop) numa transação só ----------
create or replace function public.reordenar(p_tabela text, p_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_tabela = 'categorias' then
    if exists (select 1 from categorias where id = any(p_ids) and not e_membro(empresa_id, '{dono}')) then
      raise exception 'Sem permissão';
    end if;
    update categorias c set ordem = o.n - 1
    from unnest(p_ids) with ordinality as o(id, n) where c.id = o.id;
  elsif p_tabela = 'itens' then
    if exists (select 1 from itens where id = any(p_ids) and not e_membro(empresa_id, '{dono}')) then
      raise exception 'Sem permissão';
    end if;
    update itens i set ordem = o.n - 1
    from unnest(p_ids) with ordinality as o(id, n) where i.id = o.id;
  else
    raise exception 'Tabela inválida';
  end if;
end;
$$;
grant execute on function public.reordenar(text, uuid[]) to authenticated;

-- ---------- RELATÓRIO DE VENDAS (dono/caixa) ----------
-- Período [p_inicio, p_fim) nos limites do dia de trabalho (empresas.virada_dia). Faturamento = pedidos não cancelados.
-- Horas no fuso informado; por_dia agrupa por dia de trabalho (desloca pela virada).
create or replace function public.relatorio_vendas(p_empresa_id uuid, p_inicio timestamptz, p_fim timestamptz,
                                                   p_tz text default 'America/Cuiaba', p_virada time default '00:00')
returns json
language plpgsql stable security definer set search_path = public
as $$
begin
  perform _membro_caixa(p_empresa_id);
  return (
    with base as (
      select * from pedidos
      where empresa_id = p_empresa_id and created_at >= p_inicio and created_at < p_fim
    ),
    validos as (select * from base where status <> 'cancelado' and not aceite_pendente)
    select json_build_object(
      'faturamento', coalesce((select sum(total) from validos), 0),
      'pedidos', (select count(*) from validos),
      'ticket_medio', coalesce((select round(avg(total), 2) from validos), 0),
      'cancelados', (select count(*) from base where status = 'cancelado'),
      'valor_cancelado', coalesce((select sum(total) from base where status = 'cancelado'), 0),
      'por_forma', coalesce((
        select json_agg(json_build_object('forma', f, 'valor', v, 'pedidos', n) order by v desc)
        from (select coalesce(forma_pagamento::text, 'a_definir') f, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json),
      'por_tipo', coalesce((
        select json_agg(json_build_object('tipo', t, 'valor', v, 'pedidos', n) order by v desc)
        from (select tipo::text t, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json),
      'por_origem', coalesce((
        select json_agg(json_build_object('origem', o, 'valor', v, 'pedidos', n) order by v desc)
        from (select origem::text o, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json),
      'top_produtos', coalesce((
        select json_agg(json_build_object('nome', nome, 'quantidade', q, 'valor', v) order by q desc, v desc)
        from (
          select i.nome, sum(i.quantidade) q, sum(i.preco * i.quantidade) v
          from pedido_itens i join validos p on p.id = i.pedido_id
          group by coalesce(i.item_id::text, i.nome), i.nome
          order by q desc, v desc limit 10
        ) x
      ), '[]'::json),
      'por_hora', coalesce((
        select json_agg(json_build_object('hora', h, 'valor', v, 'pedidos', n) order by h)
        from (select extract(hour from created_at at time zone p_tz)::int h, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json),
      'por_dia', coalesce((
        select json_agg(json_build_object('dia', d, 'valor', v, 'pedidos', n) order by d)
        from (select ((created_at at time zone p_tz) - p_virada::interval)::date d, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json)
    )
  );
end;
$$;
grant execute on function public.relatorio_vendas(uuid, timestamptz, timestamptz, text, time) to authenticated;

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

-- ---------- CADASTRO: limite por IP ----------
create table cadastro_tentativas (
  id          bigint generated always as identity primary key,
  ip          text not null,
  created_at  timestamptz not null default now()
);
create index cadastro_tentativas_ip on cadastro_tentativas (ip, created_at desc);
alter table cadastro_tentativas enable row level security;   -- sem policy: só service role

-- ---------- SUPER ADMIN: empresas, pedidos dos últimos 30 dias e plano ----------
-- Só service role (o Route Handler /api/superadmin valida o e-mail em SUPERADMIN_EMAILS antes de chamar).
create or replace function public.superadmin_empresas()
returns table (id uuid, nome text, slug text, ativo boolean, created_at timestamptz, pedidos_30d bigint, dono_email text,
               plano_status text, trial_ate timestamptz, origem_cadastro text)
language sql stable security definer set search_path = public
as $$
  select e.id, e.nome, e.slug, e.ativo, e.created_at,
         (select count(*) from pedidos p where p.empresa_id = e.id and p.created_at >= now() - interval '30 days'),
         (select u.email::text from membros m join auth.users u on u.id = m.user_id
          where m.empresa_id = e.id and m.papel = 'dono' order by m.created_at limit 1),
         e.plano_status, e.trial_ate, e.origem_cadastro
  from empresas e
  order by e.created_at desc;
$$;
revoke all on function public.superadmin_empresas() from public, anon, authenticated;
grant execute on function public.superadmin_empresas() to service_role;

-- ---------- REALTIME (painel do balcão) ----------
alter publication supabase_realtime add table pedidos;

-- ---------- STORAGE (fotos e logos) ----------
-- Caminho dos arquivos: {empresa_id}/arquivo.jpg
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy "dono envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.e_membro(((storage.foldername(name))[1])::uuid, '{dono}'));
create policy "dono altera fotos" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.e_membro(((storage.foldername(name))[1])::uuid, '{dono}'));
create policy "dono apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.e_membro(((storage.foldername(name))[1])::uuid, '{dono}'));

-- =====================================================================
-- SEED DE TESTE (rodar depois de criar seu usuário em Authentication > Users)
-- Troque o e-mail abaixo pelo seu.
-- =====================================================================
-- with e as (
--   insert into empresas (nome, slug, whatsapp) values ('Lanchonete Teste', 'teste', '5566999999999')
--   returning id
-- )
-- insert into membros (empresa_id, user_id, nome, papel)
-- select e.id, u.id, 'Rick', 'dono' from e, auth.users u where u.email = 'SEU@EMAIL.COM';


-- 012: clientes (com backfill), cupons de desconto e recuperador de clientes inativos.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 011).

-- ---------- TELEFONE NORMALIZADO ----------
-- Só dígitos com 55 (espelha numeroWhats em lib/telefone.ts). Menos de 10 dígitos = null.
create or replace function public.normalizar_telefone(p text)
returns text
language sql immutable set search_path = public
as $$
  select case when length(d) between 10 and 11 then '55' || d when length(d) >= 12 then d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- ---------- CLIENTES ----------
create table clientes (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references empresas(id) on delete cascade,
  telefone               text not null,
  nome                   text,
  endereco               text,
  bairro_id              uuid references bairros(id) on delete set null,
  primeiro_pedido        timestamptz,
  ultimo_pedido          timestamptz,
  total_pedidos          integer not null default 0,          -- só pedidos não cancelados
  total_gasto            numeric(10,2) not null default 0,
  optout_ofertas         boolean not null default false,      -- respondeu SAIR/PARAR
  ultimo_recuperador_em  timestamptz,
  created_at             timestamptz not null default now(),
  unique (empresa_id, telefone)
);
create index clientes_empresa_ultimo on clientes (empresa_id, ultimo_pedido);

alter table clientes enable row level security;
create policy "caixa le clientes" on clientes for select using (e_membro(empresa_id, '{dono,caixa}'));

-- ---------- CUPONS ----------
create table cupons (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  codigo         text not null check (codigo ~ '^[A-Z0-9_-]{3,30}$'),   -- sempre maiúsculo
  tipo           text not null check (tipo in ('percentual', 'valor', 'frete_gratis')),
  valor          numeric(10,2) not null default 0 check (valor >= 0),
  pedido_minimo  numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  validade       timestamptz,                                          -- null = sem validade
  usos_max       integer check (usos_max is null or usos_max > 0),     -- null = ilimitado
  usos           integer not null default 0,
  cliente_id     uuid references clientes(id) on delete cascade,       -- cupom exclusivo
  origem         text not null default 'manual' check (origem in ('manual', 'recuperador')),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (empresa_id, codigo),
  check (tipo <> 'percentual' or valor <= 100)
);

alter table cupons enable row level security;
create policy "caixa le cupons"   on cupons for select using (e_membro(empresa_id, '{dono,caixa}'));
create policy "dono gerencia cupons" on cupons for all using (e_membro(empresa_id, '{dono}'))
  with check (e_membro(empresa_id, '{dono}') and origem = 'manual');

alter table pedidos
  add column cliente_id uuid references clientes(id) on delete set null,
  add column cupom_id   uuid references cupons(id) on delete set null,
  add column desconto   numeric(10,2) not null default 0 check (desconto >= 0);
create index pedidos_cliente on pedidos (cliente_id, created_at desc);
create index pedidos_cupom on pedidos (cupom_id);

-- ---------- BACKFILL (antes dos triggers) ----------
insert into clientes (empresa_id, telefone, nome, endereco, bairro_id)
select distinct on (empresa_id, tel) empresa_id, tel, nullif(trim(cliente_nome), ''), endereco, bairro_id
from (select *, normalizar_telefone(cliente_telefone) as tel from pedidos
      where origem in ('web', 'balcao') and tipo <> 'mesa') p
where tel is not null
order by empresa_id, tel, created_at desc;

update pedidos p set cliente_id = c.id
from clientes c
where c.empresa_id = p.empresa_id and c.telefone = normalizar_telefone(p.cliente_telefone)
  and p.origem in ('web', 'balcao') and p.tipo <> 'mesa';

-- ---------- TOTAIS DO CLIENTE ----------
create or replace function public._recalcular_cliente(p_cliente uuid)
returns void
language sql security definer set search_path = public
as $$
  update clientes c set total_pedidos = x.n, total_gasto = x.v, primeiro_pedido = x.primeiro, ultimo_pedido = x.ultimo
  from (select count(*) as n, coalesce(sum(total), 0) as v, min(created_at) as primeiro, max(created_at) as ultimo
        from pedidos where cliente_id = p_cliente and status <> 'cancelado' and not aceite_pendente) x
  where c.id = p_cliente;
$$;
revoke all on function public._recalcular_cliente(uuid) from public, anon, authenticated;

select _recalcular_cliente(id) from clientes;

-- Pedido web/balcão com telefone: upsert do cliente (nome/endereço mais recentes) e liga o pedido a ele.
create or replace function public._pedido_cliente()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tel text := normalizar_telefone(new.cliente_telefone);
begin
  if new.origem in ('web', 'balcao') and new.tipo <> 'mesa' and v_tel is not null then
    insert into clientes (empresa_id, telefone, nome, endereco, bairro_id)
    values (new.empresa_id, v_tel, nullif(trim(new.cliente_nome), ''), new.endereco, new.bairro_id)
    on conflict (empresa_id, telefone) do update set
      nome      = coalesce(excluded.nome, clientes.nome),
      endereco  = coalesce(excluded.endereco, clientes.endereco),
      bairro_id = coalesce(excluded.bairro_id, clientes.bairro_id)
    returning id into new.cliente_id;
  end if;
  return new;
end;
$$;
revoke all on function public._pedido_cliente() from public, anon, authenticated;
create trigger pedidos_cliente before insert on pedidos
  for each row execute function public._pedido_cliente();

-- Contadores: recalcula quando muda status (cancelar), total ou cliente.
create or replace function public._pedido_cliente_totais()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.cliente_id is not null then perform _recalcular_cliente(new.cliente_id); end if;
  if tg_op = 'UPDATE' and old.cliente_id is not null and old.cliente_id is distinct from new.cliente_id then
    perform _recalcular_cliente(old.cliente_id);
  end if;
  return null;
end;
$$;
revoke all on function public._pedido_cliente_totais() from public, anon, authenticated;
create trigger pedidos_cliente_totais after insert or update of status, total, cliente_id on pedidos
  for each row execute function public._pedido_cliente_totais();

-- Checkout: dados salvos do mesmo telefone (só nome, endereço e bairro).
create or replace function public.cliente_por_telefone(p_empresa_id uuid, p_telefone text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object('nome', c.nome, 'endereco', c.endereco, 'bairro_id', c.bairro_id)
  from clientes c
  where c.empresa_id = p_empresa_id and c.telefone = normalizar_telefone(p_telefone) and empresa_liberada(p_empresa_id);
$$;
grant execute on function public.cliente_por_telefone(uuid, text) to anon, authenticated;

-- ---------- CUPOM: validação e desconto (100% no banco) ----------
-- Erro em texto amigável se não valer. p_travar: trava a linha do cupom (criação do pedido).
create or replace function public._calcular_cupom(p_empresa uuid, p_codigo text, p_subtotal numeric, p_taxa numeric,
                                                  p_tipo tipo_pedido, p_telefone text, p_travar boolean)
returns table (cupom_id uuid, desconto numeric)
language plpgsql security definer set search_path = public
as $$
declare
  v_cup  cupons%rowtype;
  v_desc numeric(10,2);
begin
  if p_travar then
    select * into v_cup from cupons where empresa_id = p_empresa and codigo = upper(trim(p_codigo)) for update;
  else
    select * into v_cup from cupons where empresa_id = p_empresa and codigo = upper(trim(p_codigo));
  end if;
  if not found or not v_cup.ativo then raise exception 'Cupom inválido'; end if;
  if v_cup.validade is not null and v_cup.validade <= now() then raise exception 'Este cupom expirou'; end if;
  if v_cup.usos_max is not null and v_cup.usos >= v_cup.usos_max then raise exception 'Este cupom já foi usado'; end if;
  if v_cup.cliente_id is not null and not exists (
    select 1 from clientes
    where id = v_cup.cliente_id and empresa_id = p_empresa
      and telefone = normalizar_telefone(p_telefone)
  ) then
    raise exception 'Este cupom é exclusivo de outro cliente';
  end if;
  if p_subtotal < v_cup.pedido_minimo then raise exception 'Pedido mínimo para este cupom: R$ %', v_cup.pedido_minimo; end if;
  if v_cup.tipo = 'frete_gratis' and p_tipo <> 'entrega' then raise exception 'Cupom de frete grátis só vale para entrega'; end if;

  v_desc := case v_cup.tipo
    when 'percentual' then round(p_subtotal * v_cup.valor / 100, 2)
    when 'valor' then v_cup.valor
    else p_taxa
  end;
  return query select v_cup.id, least(v_desc, p_subtotal);   -- desconto nunca maior que o subtotal
end;
$$;
revoke all on function public._calcular_cupom(uuid, text, numeric, numeric, tipo_pedido, text, boolean) from public, anon, authenticated;

-- Pré-validação ao vivo no checkout (não reserva o cupom; a criação do pedido valida de novo).
create or replace function public.validar_cupom(p_empresa_id uuid, p_codigo text, p_subtotal numeric, p_tipo tipo_pedido,
                                                p_bairro_id uuid default null, p_telefone text default null)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_taxa numeric(10,2) := 0;
  v_res  record;
begin
  if p_tipo = 'entrega' then
    select taxa into v_taxa from bairros where id = p_bairro_id and empresa_id = p_empresa_id and ativo;
  end if;
  select * into v_res from _calcular_cupom(p_empresa_id, p_codigo, coalesce(p_subtotal, 0), coalesce(v_taxa, 0),
                                           p_tipo, p_telefone, false);
  return json_build_object('ok', true, 'codigo', upper(trim(p_codigo)), 'desconto', v_res.desconto);
exception when raise_exception then
  return json_build_object('ok', false, 'erro', sqlerrm);
end;
$$;
grant execute on function public.validar_cupom(uuid, text, numeric, tipo_pedido, uuid, text) to anon, authenticated;

-- ---------- RPCs DE PEDIDO COM CUPOM ----------
drop function if exists public.criar_pedido_publico(text, tipo_pedido, jsonb, text, text, forma_pagamento, text, uuid, text, numeric);
drop function if exists public.criar_pedido_balcao(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric);
drop function if exists public._criar_pedido_externo(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, origem_pedido, boolean);

-- Mesmo corpo da 007 + cupom (desconto no total, uso incrementado na mesma transação, conversão do recuperador).
create or replace function public._criar_pedido_externo(
  p_empresa          uuid,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text,
  p_cliente_telefone text,
  p_endereco         text,
  p_bairro_id        uuid,
  p_observacao       text,
  p_forma            forma_pagamento,
  p_troco_para       numeric,
  p_origem           origem_pedido,
  p_exige_cliente    boolean,
  p_cupom            text
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_bairro  bairros%rowtype;
  v_numero  integer;
  v_pedido  uuid;
  v_sub     numeric(10,2);
  v_taxa    numeric(10,2) := 0;
  v_cupom   uuid;
  v_desc    numeric(10,2) := 0;
  v_total   numeric(10,2);
begin
  if p_tipo = 'mesa' then raise exception 'Tipo inválido'; end if;
  if p_exige_cliente and (coalesce(trim(p_cliente_nome), '') = '' or coalesce(trim(p_cliente_telefone), '') = '') then
    raise exception 'Informe nome e telefone';
  end if;
  if p_forma is not null and not exists (
    select 1 from empresas where id = p_empresa and p_forma::text = any(formas_pagamento)
  ) then
    raise exception 'Forma de pagamento não aceita por esta loja';
  end if;
  if p_troco_para is not null and p_forma is distinct from 'dinheiro' then
    raise exception 'Troco só vale para pagamento em dinheiro';
  end if;

  if p_tipo = 'entrega' then
    select * into v_bairro from bairros where id = p_bairro_id and empresa_id = p_empresa and ativo;
    if not found then raise exception 'Bairro não atendido'; end if;
    if coalesce(trim(p_endereco), '') = '' then raise exception 'Informe o endereço'; end if;
    v_taxa := v_bairro.taxa;
  end if;

  update empresas set ultimo_pedido = ultimo_pedido + 1 where id = p_empresa returning ultimo_pedido into v_numero;

  insert into pedidos (empresa_id, numero, tipo, cliente_nome, cliente_telefone, endereco, bairro_id, bairro_nome,
                       taxa_entrega, observacao, forma_pagamento, troco_para, origem)
  values (p_empresa, v_numero, p_tipo, nullif(trim(p_cliente_nome), ''), nullif(trim(p_cliente_telefone), ''),
          case when p_tipo = 'entrega' then trim(p_endereco) end, v_bairro.id, v_bairro.nome,
          v_taxa, nullif(trim(p_observacao), ''), p_forma, p_troco_para, p_origem)
  returning id into v_pedido;

  v_sub := _adicionar_itens(v_pedido, p_empresa, p_itens);

  if p_tipo = 'entrega' and v_sub < v_bairro.pedido_minimo then
    raise exception 'Pedido mínimo para este bairro: R$ %', v_bairro.pedido_minimo;
  end if;

  if coalesce(trim(p_cupom), '') <> '' then
    select c.cupom_id, c.desconto into v_cupom, v_desc
    from _calcular_cupom(p_empresa, p_cupom, v_sub, v_taxa, p_tipo, p_cliente_telefone, true) c;
    update cupons set usos = usos + 1 where id = v_cupom;
    update recuperador_envios set convertido_pedido_id = v_pedido
    where cupom_id = v_cupom and status = 'enviado' and convertido_pedido_id is null;
  end if;
  v_total := v_sub + v_taxa - v_desc;

  if p_troco_para is not null and p_troco_para < v_total then
    raise exception 'O troco deve ser para um valor maior ou igual ao total (R$ %)', v_total;
  end if;

  update pedidos set subtotal = v_sub, total = v_total, cupom_id = v_cupom, desconto = v_desc where id = v_pedido;

  return json_build_object('id', v_pedido, 'numero', v_numero, 'subtotal', v_sub,
                           'taxa_entrega', v_taxa, 'desconto', v_desc, 'total', v_total);
end;
$$;
revoke all on function public._criar_pedido_externo(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, origem_pedido, boolean, text)
  from public, anon, authenticated;

create or replace function public.criar_pedido_publico(
  p_slug             text,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text,
  p_cliente_telefone text,
  p_forma_pagamento  forma_pagamento,
  p_endereco         text default null,
  p_bairro_id        uuid default null,
  p_observacao       text default null,
  p_troco_para       numeric default null,
  p_cupom            text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_emp empresas%rowtype;
begin
  select * into v_emp from empresas where slug = p_slug and ativo;
  if not found then raise exception 'Empresa não encontrada'; end if;
  if not v_emp.aberto then raise exception 'Loja fechada no momento'; end if;
  if p_forma_pagamento is null then raise exception 'Informe a forma de pagamento'; end if;
  if p_tipo = 'entrega' and not v_emp.aceita_entrega then raise exception 'Empresa não faz entrega'; end if;
  if p_tipo = 'retirada' and not v_emp.aceita_retirada then raise exception 'Empresa não aceita retirada'; end if;

  v_pedido := _criar_pedido_externo(v_emp.id, p_tipo, p_itens, p_cliente_nome, p_cliente_telefone, p_endereco,
                                    p_bairro_id, p_observacao, p_forma_pagamento, p_troco_para, 'web', true, p_cupom);
  if p_tipo in ('entrega', 'retirada') then
    update pedidos set status = 'novo', aceite_pendente = true where id = (v_pedido ->> 'id')::uuid;
  end if;
  return v_pedido;
end;
$$;
grant execute on function public.criar_pedido_publico(text, tipo_pedido, jsonb, text, text, forma_pagamento, text, uuid, text, numeric, text)
  to anon, authenticated;

create or replace function public.criar_pedido_balcao(
  p_empresa_id       uuid,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text default null,
  p_cliente_telefone text default null,
  p_endereco         text default null,
  p_bairro_id        uuid default null,
  p_observacao       text default null,
  p_forma_pagamento  forma_pagamento default null,
  p_troco_para       numeric default null,
  p_cupom            text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not e_membro(p_empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  return _criar_pedido_externo(p_empresa_id, p_tipo, p_itens, p_cliente_nome, p_cliente_telefone, p_endereco,
                               p_bairro_id, p_observacao, p_forma_pagamento, p_troco_para, 'balcao',
                               p_tipo = 'entrega', p_cupom);
end;
$$;
grant execute on function public.criar_pedido_balcao(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, text)
  to authenticated;

-- Cancelar devolve o uso do cupom (e desfaz a conversão do recuperador). Mesmo corpo da 003 + cupom.
create or replace function public.cancelar_pedido(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ped pedidos%rowtype;
begin
  select * into v_ped from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not e_membro(v_ped.empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  if v_ped.status = 'cancelado' then return; end if;

  if v_ped.comanda_id is not null then
    update comandas set total = greatest(total - v_ped.total, 0)
    where id = v_ped.comanda_id and status = 'aberta';
    if not found then raise exception 'Comanda já fechada'; end if;
  end if;
  if v_ped.cupom_id is not null then
    update cupons set usos = greatest(usos - 1, 0) where id = v_ped.cupom_id;
    update recuperador_envios set convertido_pedido_id = null where convertido_pedido_id = p_id;
  end if;

  update pedidos set status = 'cancelado' where id = p_id;
end;
$$;

-- Confirmação do pedido: + desconto e código do cupom.
create or replace function public.ver_pedido_publico(p_slug text, p_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'numero', p.numero, 'tipo', p.tipo, 'status', p.status, 'bairro_nome', p.bairro_nome,
    'taxa', p.taxa_entrega, 'subtotal', p.subtotal, 'total', p.total, 'created_at', p.created_at,
    'forma_pagamento', p.forma_pagamento, 'troco_para', p.troco_para, 'pago', p.pago,
    'desconto', p.desconto, 'cupom', (select codigo from cupons where id = p.cupom_id),
    'itens', coalesce((
      select json_agg(json_build_object('nome', i.nome, 'preco', i.preco,
                                        'quantidade', i.quantidade, 'observacao', i.observacao))
      from pedido_itens i where i.pedido_id = p.id
    ), '[]'::json)
  )
  from pedidos p join empresas e on e.id = p.empresa_id
  where p.id = p_id and e.slug = p_slug and p.tipo <> 'mesa';
$$;

-- ---------- RECUPERADOR ----------
create table recuperador_config (
  empresa_id        uuid primary key references empresas(id) on delete cascade,
  ativo             boolean not null default false,
  dias_sem_comprar  integer not null default 10 check (dias_sem_comprar between 1 and 365),
  tipo_oferta       text not null default 'percentual' check (tipo_oferta in ('percentual', 'valor', 'frete_gratis')),
  valor_oferta      numeric(10,2) not null default 15 check (valor_oferta >= 0),
  pedido_minimo     numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  validade_dias     integer not null default 5 check (validade_dias between 1 and 90),
  intervalo_dias    integer not null default 30 check (intervalo_dias between 1 and 365),
  limite_dia        integer not null default 20 check (limite_dia between 1 and 200),
  janela_inicio     time not null default '10:00',
  janela_fim        time not null default '20:00',
  mensagem          text,                       -- null = texto padrão (lib/recuperador.ts)
  check (tipo_oferta <> 'percentual' or valor_oferta <= 100),
  check (janela_inicio < janela_fim)
);

create table recuperador_envios (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references empresas(id) on delete cascade,
  cliente_id            uuid not null references clientes(id) on delete cascade,
  cupom_id              uuid references cupons(id) on delete set null,
  enviado_em            timestamptz not null default now(),
  status                text not null default 'pendente' check (status in ('pendente', 'enviado', 'falhou')),
  erro                  text,
  convertido_pedido_id  uuid references pedidos(id) on delete set null
);
create index recuperador_envios_empresa on recuperador_envios (empresa_id, enviado_em desc);
create index recuperador_envios_cupom on recuperador_envios (cupom_id);

alter table recuperador_config enable row level security;
alter table recuperador_envios enable row level security;
create policy "dono gerencia recuperador" on recuperador_config for all using (e_membro(empresa_id, '{dono}'))
  with check (e_membro(empresa_id, '{dono}'));
create policy "dono le envios" on recuperador_envios for select using (e_membro(empresa_id, '{dono}'));

-- Empresas que podem receber envio agora: recuperador ligado, liberada e WhatsApp conectado (só service role).
create or replace function public.recuperador_empresas()
returns table (empresa_id uuid, instancia text, slug text, nome text, enviados_hoje bigint)
language sql stable security definer set search_path = public
as $$
  select e.id, w.instancia, e.slug, e.nome,
         (select count(*) from recuperador_envios r
          where r.empresa_id = e.id
            and r.status <> 'falhou'
            and r.enviado_em >= (date_trunc('day', now() at time zone 'America/Cuiaba') at time zone 'America/Cuiaba'))
  from recuperador_config c
  join empresas e on e.id = c.empresa_id
  join whatsapp_conexoes w on w.empresa_id = e.id and w.status = 'conectado'
  where c.ativo and e.ativo and empresa_liberada(e.id);
$$;
revoke all on function public.recuperador_empresas() from public, anon, authenticated;
grant execute on function public.recuperador_empresas() to service_role;

-- Clientes elegíveis (só service role). A reserva confere tudo de novo com trava.
create or replace function public.recuperador_elegiveis(p_empresa uuid, p_limite integer)
returns table (cliente_id uuid)
language sql stable security definer set search_path = public
as $$
  select c.id
  from clientes c join recuperador_config cfg on cfg.empresa_id = c.empresa_id
  where c.empresa_id = p_empresa and c.total_pedidos >= 1 and not c.optout_ofertas
    and c.ultimo_pedido < now() - make_interval(days => cfg.dias_sem_comprar)
    and (c.ultimo_recuperador_em is null or c.ultimo_recuperador_em < now() - make_interval(days => cfg.intervalo_dias))
  order by c.ultimo_pedido desc
  limit p_limite;
$$;
revoke all on function public.recuperador_elegiveis(uuid, integer) from public, anon, authenticated;
grant execute on function public.recuperador_elegiveis(uuid, integer) to service_role;

-- Reserva um envio: confere elegibilidade com trava, gera cupom exclusivo de uso único e registra o envio.
-- Idempotente entre execuções simultâneas: o segundo a chegar vê ultimo_recuperador_em recente e desiste (null).
create or replace function public.recuperador_reservar(p_empresa uuid, p_cliente uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg      recuperador_config%rowtype;
  v_cli      clientes%rowtype;
  v_codigo   text;
  v_cupom    uuid;
  v_envio    uuid;
  v_validade timestamptz;
  v_enviados bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text, 0));
  select * into v_cfg from recuperador_config where empresa_id = p_empresa and ativo;
  if not found then return null; end if;
  if not exists (
    select 1 from empresas e
    join whatsapp_conexoes w on w.empresa_id = e.id and w.status = 'conectado'
    where e.id = p_empresa and e.ativo and empresa_liberada(e.id)
  ) then return null; end if;
  if (now() at time zone 'America/Cuiaba')::time < v_cfg.janela_inicio
     or (now() at time zone 'America/Cuiaba')::time >= v_cfg.janela_fim then
    return null;
  end if;
  select count(*) into v_enviados from recuperador_envios
  where empresa_id = p_empresa and status <> 'falhou'
    and enviado_em >= (date_trunc('day', now() at time zone 'America/Cuiaba') at time zone 'America/Cuiaba');
  if v_enviados >= v_cfg.limite_dia then return null; end if;
  select * into v_cli from clientes where id = p_cliente and empresa_id = p_empresa for update;
  if not found or v_cli.optout_ofertas or v_cli.total_pedidos < 1
     or v_cli.ultimo_pedido >= now() - make_interval(days => v_cfg.dias_sem_comprar)
     or (v_cli.ultimo_recuperador_em is not null and v_cli.ultimo_recuperador_em >= now() - make_interval(days => v_cfg.intervalo_dias))
  then
    return null;
  end if;

  v_validade := now() + make_interval(days => v_cfg.validade_dias);
  loop
    v_codigo := 'VOLTA' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    begin
      insert into cupons (empresa_id, codigo, tipo, valor, pedido_minimo, validade, usos_max, cliente_id, origem)
      values (p_empresa, v_codigo, v_cfg.tipo_oferta, v_cfg.valor_oferta, v_cfg.pedido_minimo, v_validade, 1, p_cliente, 'recuperador')
      returning id into v_cupom;
      exit;
    exception when unique_violation then
      -- código já existe: sorteia outro
    end;
  end loop;

  insert into recuperador_envios (empresa_id, cliente_id, cupom_id) values (p_empresa, p_cliente, v_cupom)
  returning id into v_envio;
  update clientes set ultimo_recuperador_em = now() where id = p_cliente;

  return json_build_object('envio_id', v_envio, 'codigo', v_codigo, 'validade', v_validade,
                           'telefone', v_cli.telefone, 'nome', v_cli.nome);
end;
$$;
revoke all on function public.recuperador_reservar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recuperador_reservar(uuid, uuid) to service_role;

-- Métricas do recuperador (dono): conversão = pedido não cancelado com o cupom enviado.
create or replace function public.recuperador_metricas(p_empresa_id uuid, p_dias integer default 30)
returns json
language plpgsql stable security definer set search_path = public
as $$
begin
  if not e_membro(p_empresa_id, '{dono}') then raise exception 'Sem permissão'; end if;
  return (
    with envios as (
      select * from recuperador_envios
      where empresa_id = p_empresa_id and status = 'enviado' and enviado_em >= now() - make_interval(days => p_dias)
    ),
    convertidos as (
      select p.total from envios e join pedidos p on p.id = e.convertido_pedido_id
      where p.status <> 'cancelado' and not p.aceite_pendente
    )
    select json_build_object(
      'enviados', (select count(*) from envios),
      'convertidos', (select count(*) from convertidos),
      'faturamento', coalesce((select sum(total) from convertidos), 0)
    )
  );
end;
$$;
grant execute on function public.recuperador_metricas(uuid, integer) to authenticated;

-- ---------- RELATÓRIO: + total de descontos ----------
-- Mesmo corpo da 009 + 'descontos' e 'pedidos_com_cupom'.
create or replace function public.relatorio_vendas(p_empresa_id uuid, p_inicio timestamptz, p_fim timestamptz,
                                                   p_tz text default 'America/Cuiaba', p_virada time default '00:00')
returns json
language plpgsql stable security definer set search_path = public
as $$
begin
  perform _membro_caixa(p_empresa_id);
  return (
    with base as (
      select * from pedidos
      where empresa_id = p_empresa_id and created_at >= p_inicio and created_at < p_fim
    ),
    validos as (select * from base where status <> 'cancelado' and not aceite_pendente)
    select json_build_object(
      'faturamento', coalesce((select sum(total) from validos), 0),
      'pedidos', (select count(*) from validos),
      'ticket_medio', coalesce((select round(avg(total), 2) from validos), 0),
      'cancelados', (select count(*) from base where status = 'cancelado'),
      'valor_cancelado', coalesce((select sum(total) from base where status = 'cancelado'), 0),
      'descontos', coalesce((select sum(desconto) from validos), 0),
      'pedidos_com_cupom', (select count(*) from validos where cupom_id is not null),
      'por_forma', coalesce((
        select json_agg(json_build_object('forma', f, 'valor', v, 'pedidos', n) order by v desc)
        from (select coalesce(forma_pagamento::text, 'a_definir') f, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json),
      'por_tipo', coalesce((
        select json_agg(json_build_object('tipo', t, 'valor', v, 'pedidos', n) order by v desc)
        from (select tipo::text t, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json),
      'por_origem', coalesce((
        select json_agg(json_build_object('origem', o, 'valor', v, 'pedidos', n) order by v desc)
        from (select origem::text o, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json),
      'top_produtos', coalesce((
        select json_agg(json_build_object('nome', nome, 'quantidade', q, 'valor', v) order by q desc, v desc)
        from (
          select i.nome, sum(i.quantidade) q, sum(i.preco * i.quantidade) v
          from pedido_itens i join validos p on p.id = i.pedido_id
          group by coalesce(i.item_id::text, i.nome), i.nome
          order by q desc, v desc limit 10
        ) x
      ), '[]'::json),
      'por_hora', coalesce((
        select json_agg(json_build_object('hora', h, 'valor', v, 'pedidos', n) order by h)
        from (select extract(hour from created_at at time zone p_tz)::int h, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json),
      'por_dia', coalesce((
        select json_agg(json_build_object('dia', d, 'valor', v, 'pedidos', n) order by d)
        from (select ((created_at at time zone p_tz) - p_virada::interval)::date d, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json)
    )
  );
end;
$$;

-- ---------- AGENDAMENTO (rodar à parte, trocando DOMINIO e SEGREDO) ----------
-- Precisa das extensões pg_cron e pg_net (Database > Extensions). A cada 10 min:
--   select cron.schedule('recuperador', '*/10 * * * *', $cron$
--     select net.http_post(
--       url := 'https://DOMINIO/api/recuperador/processar?secret=SEGREDO',
--       headers := '{"Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb,
--       timeout_milliseconds := 120000
--     );
--   $cron$);

-- 014: opções de ponto da carne por item e snapshot da escolha em pedido_itens.
-- Aplicar depois da 013. As RPCs de pedido mantêm suas assinaturas atuais, inclusive p_cupom.

alter table public.itens
  add column ponto_carne_ativo boolean not null default false,
  add column ponto_carne_opcoes text[] not null
    default array['Mal passado', 'Ao ponto', 'Bem passado']::text[],
  add column ponto_carne_obrigatorio boolean not null default false,
  add constraint itens_ponto_carne_opcoes_validas
    check (cardinality(ponto_carne_opcoes) between 1 and 10);

alter table public.pedido_itens
  add column ponto_carne text;

-- Atualiza a rotina comum a pedidos web, balcão e mesa/garçom.
create or replace function public._adicionar_itens(p_pedido uuid, p_empresa uuid, p_itens jsonb)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_el    jsonb;
  v_item  itens%rowtype;
  v_qtd   integer;
  v_ponto text;
  v_sub   numeric(10,2) := 0;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens';
  end if;

  for v_el in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_el->>'quantidade')::integer, 1);
    if v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;

    select * into v_item from itens
    where id = (v_el->>'item_id')::uuid and empresa_id = p_empresa;

    if not found then raise exception 'Item não encontrado'; end if;
    if not v_item.disponivel then raise exception 'Item esgotado: %', v_item.nome; end if;

    v_ponto := nullif(trim(v_el->>'ponto_carne'), '');
    if v_item.ponto_carne_ativo then
      if cardinality(v_item.ponto_carne_opcoes) = 0 then
        raise exception 'Configure as opções de ponto da carne para: %', v_item.nome;
      end if;
      if v_item.ponto_carne_obrigatorio and v_ponto is null then
        raise exception 'Escolha o ponto da carne para: %', v_item.nome;
      end if;
      if v_ponto is not null and not (v_ponto = any(v_item.ponto_carne_opcoes)) then
        raise exception 'Ponto da carne inválido para: %', v_item.nome;
      end if;
    else
      v_ponto := null;
    end if;

    insert into pedido_itens (pedido_id, empresa_id, item_id, nome, preco, quantidade, observacao, ponto_carne)
    values (p_pedido, p_empresa, v_item.id, v_item.nome, v_item.preco, v_qtd,
            nullif(v_el->>'observacao', ''), v_ponto);

    v_sub := v_sub + v_item.preco * v_qtd;
  end loop;

  return v_sub;
end;
$$;
revoke all on function public._adicionar_itens(uuid, uuid, jsonb) from public, anon, authenticated;

-- Inclui a escolha no resumo público; pedidos antigos retornam null neste campo.
create or replace function public.ver_pedido_publico(p_slug text, p_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'numero', p.numero, 'tipo', p.tipo,
    'status', case when p.aceite_pendente then 'aguardando_aceite' else p.status::text end,
    'bairro_nome', p.bairro_nome,
    'taxa', p.taxa_entrega, 'subtotal', p.subtotal, 'total', p.total, 'created_at', p.created_at,
    'forma_pagamento', p.forma_pagamento, 'troco_para', p.troco_para, 'pago', p.pago,
    'desconto', p.desconto, 'cupom', (select codigo from cupons where id = p.cupom_id),
    'itens', coalesce((
      select json_agg(json_build_object('nome', i.nome, 'preco', i.preco,
                                        'quantidade', i.quantidade, 'observacao', i.observacao,
                                        'ponto_carne', i.ponto_carne))
      from pedido_itens i where i.pedido_id = p.id
    ), '[]'::json)
  )
  from pedidos p join empresas e on e.id = p.empresa_id
  where p.id = p_id and e.slug = p_slug and p.tipo <> 'mesa';
$$;
