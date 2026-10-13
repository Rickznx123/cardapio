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
    'numero', p.numero, 'tipo', p.tipo, 'status', p.status, 'bairro_nome', p.bairro_nome,
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
