-- 009: horários com vários turnos por dia (e virada de madrugada) + dia operacional configurável.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 008).

-- ---------- HORÁRIOS: {dia: {aberto, abre, fecha}} → {dia: [{abre, fecha}]} (lista vazia = fechado) ----------
-- Idempotente: dia que já é lista fica como está.
update empresas e set horarios = (
  select coalesce(jsonb_object_agg(k, case
    when jsonb_typeof(v) = 'array' then v
    when coalesce((v ->> 'aberto')::boolean, false) then jsonb_build_array(jsonb_build_object('abre', v ->> 'abre', 'fecha', v ->> 'fecha'))
    else '[]'::jsonb
  end), '{}'::jsonb)
  from jsonb_each(e.horarios) as x(k, v)
)
where jsonb_typeof(horarios) = 'object';

-- ---------- DIA OPERACIONAL ----------
-- O dia de trabalho termina a esta hora do dia seguinte (pedido de 01:00 de domingo conta no sábado).
alter table empresas add column if not exists virada_dia time not null default '05:00';

-- ---------- RELATÓRIO: agrupa por dia de trabalho ----------
-- Mesmo corpo da 007; por_dia desloca pela virada. O período [p_inicio, p_fim) já vem nos limites do dia de trabalho.
drop function if exists public.relatorio_vendas(uuid, timestamptz, timestamptz, text);
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
    validos as (select * from base where status <> 'cancelado')
    select json_build_object(
      'faturamento', coalesce((select sum(total) from validos), 0),
      'pedidos', (select count(*) from validos),
      'ticket_medio', coalesce((select round(avg(total), 2) from validos), 0),
      'cancelados', (select count(*) from base where status = 'cancelado'),
      'valor_cancelado', coalesce((select sum(total) from base where status = 'cancelado'), 0),
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
grant execute on function public.relatorio_vendas(uuid, timestamptz, timestamptz, text, time) to authenticated;
