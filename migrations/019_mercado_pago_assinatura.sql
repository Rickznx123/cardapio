-- Aplicar depois da 018. Introduz assinatura recorrente por Mercado Pago em ambiente de teste.
create type if not exists forma_assinatura as enum ('cartao', 'pix');

alter table public.empresas
  add column if not exists pago_ate timestamptz,
  add column if not exists forma_assinatura forma_assinatura not null default 'cartao',
  add column if not exists mp_preapproval_id text,
  add column if not exists cortesia boolean not null default false;

update public.empresas
set cortesia = true
where plano_status = 'ativo';

create unique index if not exists empresas_mp_preapproval_id_idx
  on public.empresas (mp_preapproval_id)
  where mp_preapproval_id is not null;

create table if not exists public.pagamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  provedor       text not null default 'mercadopago' check (provedor = 'mercadopago'),
  tipo           forma_assinatura not null,
  mp_id          text not null unique,
  status         text not null check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  valor          numeric(10,2) not null check (valor > 0),
  periodo_inicio timestamptz,
  periodo_fim    timestamptz,
  raw            jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists pagamentos_empresa_idx on public.pagamentos (empresa_id, created_at desc);

alter table public.pagamentos enable row level security;
create policy "dono le pagamentos" on public.pagamentos
  for select using (
    exists (
      select 1 from public.membros m
      where m.empresa_id = pagamentos.empresa_id
        and m.user_id = auth.uid()
        and m.ativo
        and m.papel = 'dono'
    )
  );

create or replace function public.empresa_liberada(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = public
as $
  select coalesce((
    select ativo and (
      cortesia
      or plano_status = 'ativo'
      or (plano_status = 'trial' and trial_ate > now())
      or (pago_ate is not null and pago_ate + interval '3 days' > now())
    )
    from public.empresas where id = p_empresa
  ), false);
$;
grant execute on function public.empresa_liberada(uuid) to anon, authenticated, service_role;

comment on column public.empresas.pago_ate is 'Fim do período pago atual; com 3 dias de carência a empresa continua liberada.';
comment on column public.empresas.forma_assinatura is 'Forma preferencial do pagamento recorrente em ambiente de teste: cartao ou pix.';
comment on column public.empresas.cortesia is 'Acesso liberado manualmente pela plataforma sem cobrança.';
