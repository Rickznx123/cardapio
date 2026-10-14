-- O horário configurado é a única fonte de verdade para o estado de funcionamento.
create or replace function public.status_loja(p_empresa_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_horarios jsonb;
  v_configurado boolean;
  v_aberto boolean := false;
  v_agora timestamptz := now();
  v_local timestamp;
  v_proxima timestamptz;
  v_fuso constant text := 'America/Cuiaba';
begin
  select e.horarios into v_horarios
  from public.empresas e
  where e.id = p_empresa_id;
  if not found then return null; end if;

  v_configurado := v_horarios is not null
    and jsonb_typeof(v_horarios) = 'object'
    and v_horarios <> '{}'::jsonb;

  if not v_configurado then
    return jsonb_build_object('aberto', true, 'horarios_configurados', false, 'proxima_mudanca', null);
  end if;

  v_local := v_agora at time zone v_fuso;
  with dias as (
    select (v_local::date + serie.dia)::date as dia_local
    from generate_series(-1, 8) as serie(dia)
  ),
  dias_semana as (
    select d.dia_local,
      case extract(dow from d.dia_local)::integer
        when 0 then 'dom' when 1 then 'seg' when 2 then 'ter' when 3 then 'qua'
        when 4 then 'qui' when 5 then 'sex' when 6 then 'sab'
      end as dia_semana
    from dias d
  ),
  turnos as (
    select d.dia_local, t.turno
    from dias_semana d
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(v_horarios -> d.dia_semana) = 'array' then v_horarios -> d.dia_semana
        else '[]'::jsonb
      end
    ) as t(turno)
  ),
  intervalos as (
    select
      (d.dia_local + (d.turno ->> 'abre')::time) at time zone v_fuso as inicio,
      (d.dia_local
        + case when (d.turno ->> 'fecha')::time <= (d.turno ->> 'abre')::time then 1 else 0 end
        + (d.turno ->> 'fecha')::time) at time zone v_fuso as fim
    from turnos d
  )
  select
    coalesce(bool_or(v_agora >= i.inicio and v_agora < i.fim), false),
    case
      when coalesce(bool_or(v_agora >= i.inicio and v_agora < i.fim), false)
        then min(i.fim) filter (where v_agora >= i.inicio and v_agora < i.fim)
      else min(i.inicio) filter (where i.inicio > v_agora)
    end
  into v_aberto, v_proxima
  from intervalos i;

  return jsonb_build_object(
    'aberto', v_aberto,
    'horarios_configurados', true,
    'proxima_mudanca', v_proxima
  );
end;
$$;
revoke all on function public.status_loja(uuid) from public, anon, authenticated;
grant execute on function public.status_loja(uuid) to anon, authenticated, service_role;

-- Remove o interruptor manual; o campo legado empresas.aberto deixa de ser consultado.
drop function if exists public.alternar_loja(uuid, boolean);
comment on column public.empresas.aberto is 'Legado: não controla funcionamento; use empresas.horarios e status_loja.';

-- Mantém a assinatura e p_cupom da RPC pública; balcão e mesa continuam sem bloqueio de horário.
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
  if not coalesce((public.status_loja(v_emp.id) ->> 'aberto')::boolean, false) then
    raise exception 'Loja fechada no momento. Confira os horários de funcionamento.';
  end if;
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
