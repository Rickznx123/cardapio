-- 010: lançamento — rotas novas reservadas como slug e listagem do super admin.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 009).

-- Antes, confira se alguma loja já usa um dos slugs novos (deve voltar vazio; se não, troque o slug dela):
--   select id, nome, slug from empresas where slug in ('superadmin', 'termos', 'privacidade', 'redefinir-senha');

-- ---------- SLUGS RESERVADOS: /superadmin, /termos, /privacidade, /redefinir-senha ----------
alter table empresas drop constraint empresas_slug_valido;
alter table empresas add constraint empresas_slug_valido check (
  slug ~ '^[a-z0-9-]{3,40}$'
  and slug not in ('admin', 'login', 'api', 'balcao', 'garcom', 'pedido', 'painel', '_next', 'icons',
                   'superadmin', 'termos', 'privacidade', 'redefinir-senha')
);

-- ---------- SUPER ADMIN: empresas + pedidos dos últimos 30 dias ----------
-- Só service role (o Route Handler /api/superadmin valida o e-mail em SUPERADMIN_EMAILS antes de chamar).
create or replace function public.superadmin_empresas()
returns table (id uuid, nome text, slug text, ativo boolean, created_at timestamptz, pedidos_30d bigint, dono_email text)
language sql stable security definer set search_path = public
as $$
  select e.id, e.nome, e.slug, e.ativo, e.created_at,
         (select count(*) from pedidos p where p.empresa_id = e.id and p.created_at >= now() - interval '30 days'),
         (select u.email::text from membros m join auth.users u on u.id = m.user_id
          where m.empresa_id = e.id and m.papel = 'dono' order by m.created_at limit 1)
  from empresas e
  order by e.created_at desc;
$$;
revoke all on function public.superadmin_empresas() from public, anon, authenticated;
grant execute on function public.superadmin_empresas() to service_role;
