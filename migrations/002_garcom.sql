-- 002: login do garçom por nome + PIN.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança.

-- Tela de login do garçom (/[slug]/garcom): lista só id e nome, sem e-mail.
create or replace function public.listar_garcons(p_slug text)
returns table (id uuid, nome text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.nome
  from membros m join empresas e on e.id = m.empresa_id
  where e.slug = p_slug and e.ativo and m.ativo and m.papel = 'garcom'
  order by m.nome;
$$;
grant execute on function public.listar_garcons(text) to anon, authenticated;
