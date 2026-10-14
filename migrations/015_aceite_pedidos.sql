-- 015: aceite de pedidos web de entrega/retirada e impressão após confirmação.
-- Os pedidos de mesa, garçom e balcão mantêm o fluxo atual.

create extension if not exists pg_cron;

alter table public.pedidos
  add column cancelamento_motivo text,
  add column aceito_em timestamptz,
  add column aceite_pendente boolean not null default false;

-- Mantém os argumentos, inclusive p_cupom, e toda a validação da RPC existente.
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
  v_pedido json;
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

-- Chamado pelo pg_cron a cada minuto; a transição para preparo só acontece uma vez.
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

create or replace function public.ver_pedido_publico(p_slug text, p_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'numero', p.numero, 'tipo', p.tipo,
    'status', case when p.aceite_pendente then 'aguardando_aceite' else p.status::text end,
    'bairro_nome', p.bairro_nome, 'taxa', p.taxa_entrega, 'subtotal', p.subtotal,
    'total', p.total, 'created_at', p.created_at, 'forma_pagamento', p.forma_pagamento,
    'troco_para', p.troco_para, 'pago', p.pago, 'desconto', p.desconto,
    'cupom', (select codigo from cupons where id = p.cupom_id),
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
grant execute on function public.ver_pedido_publico(text, uuid) to anon, authenticated;

-- Pedidos pendentes não entram nos totais e nas métricas de vendas dos clientes.
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
select public._recalcular_cliente(id) from public.clientes;

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
