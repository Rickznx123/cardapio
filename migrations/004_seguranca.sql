-- 004: cancelamento só via RPC; acompanhamento do pedido amarrado ao slug.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 003).

-- 1. Update direto não pode cancelar (cancelar_pedido é security definer e ignora RLS).
drop policy "caixa atualiza pedidos" on pedidos;
create policy "caixa atualiza pedidos" on pedidos for update using (e_membro(empresa_id, '{dono,caixa}'))
  with check (e_membro(empresa_id, '{dono,caixa}') and status <> 'cancelado');

-- 2. ver_pedido_publico passa a exigir o slug da empresa dona do pedido.
drop function if exists public.ver_pedido_publico(uuid);

create or replace function public.ver_pedido_publico(p_slug text, p_id uuid)
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
  from pedidos p join empresas e on e.id = p.empresa_id
  where p.id = p_id and e.slug = p_slug and p.tipo <> 'mesa';
$$;
grant execute on function public.ver_pedido_publico(text, uuid) to anon, authenticated;
