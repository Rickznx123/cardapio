-- 011: teste grátis e cadastro self-service.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 010).

-- Antes, confira se alguma loja usa um slug que virou rota (deve voltar vazio):
--   select id, nome, slug from empresas where slug in ('cadastro', 'opengraph-image');

-- ---------- PLANO / TRIAL ----------
alter table empresas
  add column plano_status text not null default 'trial'
    constraint empresas_plano_status check (plano_status in ('trial', 'ativo', 'vencido', 'cancelado')),
  add column trial_ate timestamptz default now() + interval '14 days',
  add column origem_cadastro text not null default 'superadmin'
    constraint empresas_origem_cadastro check (origem_cadastro in ('self', 'superadmin'));
-- Empresas que já existiam são clientes: plano ativo.
update empresas set plano_status = 'ativo';

-- Liberada = não desativada pelo super admin e (plano ativo ou trial no prazo).
create or replace function public.empresa_liberada(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select ativo and (plano_status = 'ativo' or (plano_status = 'trial' and trial_ate > now()))
    from empresas where id = p_empresa
  ), false);
$$;
grant execute on function public.empresa_liberada(uuid) to anon, authenticated;

-- Pedido novo só em empresa liberada (vale para web, balcão e garçom: todas as RPCs inserem em pedidos).
create or replace function public._pedido_empresa_liberada()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not empresa_liberada(new.empresa_id) then raise exception 'Loja indisponível no momento'; end if;
  return new;
end;
$$;
revoke all on function public._pedido_empresa_liberada() from public, anon, authenticated;
create trigger pedidos_empresa_liberada before insert on pedidos
  for each row execute function public._pedido_empresa_liberada();

-- Login do garçom: lista vazia se a empresa não estiver liberada.
create or replace function public.listar_garcons(p_slug text)
returns table (id uuid, nome text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.nome
  from membros m join empresas e on e.id = m.empresa_id
  where e.slug = p_slug and empresa_liberada(e.id) and m.ativo and m.papel = 'garcom'
  order by m.nome;
$$;

-- ---------- SLUGS RESERVADOS: /cadastro e /opengraph-image ----------
alter table empresas drop constraint empresas_slug_valido;
alter table empresas add constraint empresas_slug_valido check (
  slug ~ '^[a-z0-9-]{3,40}$'
  and slug not in ('admin', 'login', 'api', 'balcao', 'garcom', 'pedido', 'painel', '_next', 'icons',
                   'superadmin', 'termos', 'privacidade', 'redefinir-senha', 'cadastro', 'opengraph-image')
);

-- ---------- CADASTRO: limite por IP ----------
create table cadastro_tentativas (
  id          bigint generated always as identity primary key,
  ip          text not null,
  created_at  timestamptz not null default now()
);
create index cadastro_tentativas_ip on cadastro_tentativas (ip, created_at desc);
alter table cadastro_tentativas enable row level security;   -- sem policy: só service role

-- ---------- SUPER ADMIN: + plano ----------
drop function if exists public.superadmin_empresas();
create function public.superadmin_empresas()
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
