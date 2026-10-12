-- 003: slugs reservados, acompanhamento público do pedido, cancelamento com ajuste da comanda.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança.
-- Falha se já existir empresa com slug inválido: corrija o slug antes de rodar.

alter table empresas add constraint empresas_slug_valido check (
  slug ~ '^[a-z0-9-]{3,40}$'
  and slug not in ('admin', 'login', 'api', 'balcao', 'garcom', 'pedido', '_next', 'icons')
);

-- Acompanhamento do pedido pelo cliente (/[slug]/pedido/[id]). Sem telefone/endereço; só pedidos não-mesa.
create or replace function public.ver_pedido_publico(p_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'numero', p.numero, 'tipo', p.tipo, 'status', p.status, 'bairro_nome', p.bairro_nome,
    'taxa', p.taxa_entrega, 'subtotal', p.subtotal, 'total', p.total, 'created_at', p.created_at,
    'itens', coalesce((
      select json_agg(json_build_object('nome', i.nome, 'preco', i.preco,
                                        'quantidade', i.quantidade, 'observacao', i.observacao))
      from pedido_itens i where i.pedido_id = p.id
    ), '[]'::json)
  )
  from pedidos p
  where p.id = p_id and p.tipo <> 'mesa';
$$;
grant execute on function public.ver_pedido_publico(uuid) to anon, authenticated;

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
