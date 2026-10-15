-- Aplicar depois da 018. Assinatura pelo Mercado Pago: cartão recorrente (preapproval) ou Pix avulso de 30 dias.
do $$ begin
  create type forma_assinatura as enum ('cartao', 'pix');
exception when duplicate_object then null;
end $$;

alter table public.empresas
  add column if not exists pago_ate timestamptz,
  add column if not exists forma_assinatura forma_assinatura, -- null até o primeiro pagamento
  add column if not exists mp_preapproval_id text,
  add column if not exists cortesia boolean not null default false;

-- Quem já era 'ativo' pagava por fora (WhatsApp): segue liberado como cortesia até migrar para o Mercado Pago.
update public.empresas set cortesia = true where plano_status = 'ativo' and pago_ate is null;

create unique index if not exists empresas_mp_preapproval_id_idx
  on public.empresas (mp_preapproval_id)
  where mp_preapproval_id is not null;

create table if not exists public.pagamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  provedor       text not null default 'mercadopago' check (provedor = 'mercadopago'),
  tipo           forma_assinatura not null,
  mp_id          text not null unique, -- payment (Pix) ou authorized_payment (cartão)
  status         text not null check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  valor          numeric(10,2) not null check (valor > 0),
  periodo_inicio timestamptz,
  periodo_fim    timestamptz,
  raw            jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists pagamentos_empresa_idx on public.pagamentos (empresa_id, created_at desc);

alter table public.pagamentos enable row level security;
drop policy if exists "dono le pagamentos" on public.pagamentos;
create policy "dono le pagamentos" on public.pagamentos for select using (public.e_membro(empresa_id, '{dono}'));

-- Idempotência dos e-mails de cobrança (lembretes, boas-vindas, recusado). Sem policy: só service role.
create table if not exists public.emails_enviados (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  chave      text not null,
  created_at timestamptz not null default now(),
  primary key (empresa_id, chave)
);
alter table public.emails_enviados enable row level security;

create or replace function public.empresa_liberada(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select ativo and (
      cortesia
      or plano_status = 'ativo'
      or (plano_status = 'trial' and trial_ate > now())
      or (pago_ate is not null and pago_ate + interval '3 days' > now())
    )
    from public.empresas where id = p_empresa
  ), false);
$$;
grant execute on function public.empresa_liberada(uuid) to anon, authenticated, service_role;

-- Grava/atualiza um pagamento do MP e, na primeira vez que ele fica aprovado, estende pago_ate
-- (Pix: +30 dias; cartão: +1 mês) a partir do maior entre pago_ate e agora. Idempotente por mp_id.
create or replace function public.registrar_pagamento_mp(
  p_empresa uuid, p_tipo forma_assinatura, p_mp_id text, p_status text, p_valor numeric, p_raw jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_antes    text;
  v_inicio   timestamptz;
  v_fim      timestamptz;
  v_primeiro boolean := false;
begin
  -- Trava a empresa: dois webhooks simultâneos do mesmo pagamento não estendem duas vezes.
  select greatest(coalesce(pago_ate, now()), now()) into v_inicio from empresas where id = p_empresa for update;
  if not found then raise exception 'Empresa não encontrada'; end if;
  select status into v_antes from pagamentos where mp_id = p_mp_id;
  -- shortcut: aprovado é final (estorno/chargeback não tira dias); tratar se passar a acontecer.
  if v_antes = 'aprovado' or v_antes = p_status then
    return jsonb_build_object('mudou', false, 'primeiro', false);
  end if;

  if p_status = 'aprovado' then
    v_primeiro := not exists (select 1 from pagamentos where empresa_id = p_empresa and status = 'aprovado');
    v_fim := v_inicio + case p_tipo when 'pix' then interval '30 days' else interval '1 month' end;
    update empresas set pago_ate = v_fim, plano_status = 'ativo', forma_assinatura = p_tipo where id = p_empresa;
  else
    v_inicio := null;
  end if;

  insert into pagamentos (empresa_id, tipo, mp_id, status, valor, periodo_inicio, periodo_fim, raw)
  values (p_empresa, p_tipo, p_mp_id, p_status, p_valor, v_inicio, v_fim, p_raw)
  on conflict (mp_id) do update set status = excluded.status, valor = excluded.valor,
    periodo_inicio = excluded.periodo_inicio, periodo_fim = excluded.periodo_fim, raw = excluded.raw;
  return jsonb_build_object('mudou', true, 'primeiro', v_primeiro);
end;
$$;
revoke all on function public.registrar_pagamento_mp(uuid, forma_assinatura, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_pagamento_mp(uuid, forma_assinatura, text, text, numeric, jsonb) to service_role;

drop function if exists public.superadmin_empresas();
create function public.superadmin_empresas()
returns table (id uuid, nome text, slug text, ativo boolean, created_at timestamptz, pedidos_30d bigint, dono_email text,
               plano_status text, trial_ate timestamptz, pago_ate timestamptz, forma_assinatura forma_assinatura,
               cortesia boolean, origem_cadastro text)
language sql stable security definer set search_path = public
as $$
  select e.id, e.nome, e.slug, e.ativo, e.created_at,
         (select count(*) from pedidos p where p.empresa_id = e.id and p.created_at >= now() - interval '30 days'),
         (select u.email::text from membros m join auth.users u on u.id = m.user_id
          where m.empresa_id = e.id and m.papel = 'dono' order by m.created_at limit 1),
         e.plano_status, e.trial_ate, e.pago_ate, e.forma_assinatura, e.cortesia, e.origem_cadastro
  from empresas e
  order by e.created_at desc;
$$;
revoke all on function public.superadmin_empresas() from public, anon, authenticated;
grant execute on function public.superadmin_empresas() to service_role;

comment on column public.empresas.pago_ate is 'Fim do período pago atual; com 3 dias de carência a empresa continua liberada.';
comment on column public.empresas.forma_assinatura is 'Forma do último pagamento aprovado: cartao (recorrente) ou pix (30 dias).';
comment on column public.empresas.cortesia is 'Acesso liberado manualmente pela plataforma sem cobrança.';

-- ---------- AGENDAMENTO (rodar à parte, trocando DOMINIO e SEGREDO) ----------
-- pg_cron roda em UTC: 09:00 em Cuiabá (UTC-4, sem horário de verão) = 13:00 UTC.
--   select cron.schedule('assinatura-rotina', '0 13 * * *', $cron$
--     select net.http_post(
--       url := 'https://DOMINIO/api/assinatura/rotina?secret=SEGREDO',
--       headers := '{"Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb,
--       timeout_milliseconds := 120000
--     );
--   $cron$);
