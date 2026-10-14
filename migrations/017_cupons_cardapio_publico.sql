-- Permite ao dono escolher quais cupons públicos serão divulgados no cardápio.
alter table public.cupons
  add column mostrar_no_cardapio boolean not null default false;

-- Expõe somente os dados necessários para divulgar cupons públicos elegíveis.
create or replace function public.cupons_publicos_cardapio(p_slug text)
returns table (codigo text, tipo text, valor numeric, pedido_minimo numeric)
language sql stable security definer set search_path = public
as $$
  select c.codigo, c.tipo, c.valor, c.pedido_minimo
  from public.cupons c
  join public.empresas e on e.id = c.empresa_id
  where e.slug = p_slug
    and e.ativo
    and public.empresa_liberada(e.id)
    and c.mostrar_no_cardapio
    and c.ativo
    and (c.validade is null or c.validade > now())
    and (c.usos_max is null or c.usos < c.usos_max)
    and c.cliente_id is null
    and (c.tipo <> 'frete_gratis' or e.aceita_entrega)
  order by c.codigo;
$$;
revoke all on function public.cupons_publicos_cardapio(text) from public, anon, authenticated;
grant execute on function public.cupons_publicos_cardapio(text) to anon, authenticated;
