-- Aplicar depois da 019. Estorno/chargeback de pagamento aprovado devolve os dias que ele tinha dado.
alter table public.pagamentos drop constraint if exists pagamentos_status_check;
alter table public.pagamentos add constraint pagamentos_status_check
  check (status in ('pendente', 'aprovado', 'recusado', 'cancelado', 'estornado'));

-- Grava/atualiza um pagamento do MP. Aprovado (1ª vez): estende pago_ate (Pix: +30 dias; cartão: +1 mês) a partir do
-- maior entre pago_ate e agora. Estornado depois de aprovado: tira o mesmo período. Aprovado só muda para estornado,
-- estornado é final. Idempotente por mp_id.
create or replace function public.registrar_pagamento_mp(
  p_empresa uuid, p_tipo forma_assinatura, p_mp_id text, p_status text, p_valor numeric, p_raw jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_antes    text;
  v_periodo  interval;
  v_inicio   timestamptz;
  v_fim      timestamptz;
  v_primeiro boolean := false;
begin
  -- Trava a empresa: dois webhooks simultâneos do mesmo pagamento não estendem duas vezes.
  select greatest(coalesce(pago_ate, now()), now()) into v_inicio from empresas where id = p_empresa for update;
  if not found then raise exception 'Empresa não encontrada'; end if;
  select status, periodo_fim - periodo_inicio into v_antes, v_periodo from pagamentos where mp_id = p_mp_id;
  if v_antes = p_status or v_antes = 'estornado' or (v_antes = 'aprovado' and p_status <> 'estornado') then
    return jsonb_build_object('mudou', false, 'primeiro', false);
  end if;

  if p_status = 'aprovado' then
    v_primeiro := not exists (select 1 from pagamentos where empresa_id = p_empresa and status = 'aprovado');
    v_fim := v_inicio + case p_tipo when 'pix' then interval '30 days' else interval '1 month' end;
    update empresas set pago_ate = v_fim, plano_status = 'ativo', forma_assinatura = p_tipo where id = p_empresa;
  else
    v_inicio := null;
    if p_status = 'estornado' and v_antes = 'aprovado' and v_periodo is not null then
      -- Já passou da carência com os dias a menos: vence na hora (sem esperar a rotina).
      update empresas set pago_ate = pago_ate - v_periodo,
        plano_status = case when plano_status = 'ativo' and not cortesia and pago_ate - v_periodo + interval '3 days' <= now()
                            then 'vencido' else plano_status end
      where id = p_empresa;
    end if;
  end if;

  insert into pagamentos (empresa_id, tipo, mp_id, status, valor, periodo_inicio, periodo_fim, raw)
  values (p_empresa, p_tipo, p_mp_id, p_status, p_valor, v_inicio, v_fim, p_raw)
  on conflict (mp_id) do update set status = excluded.status, valor = excluded.valor, raw = excluded.raw,
    -- Estorno mantém o período original no histórico.
    periodo_inicio = coalesce(excluded.periodo_inicio, pagamentos.periodo_inicio),
    periodo_fim = coalesce(excluded.periodo_fim, pagamentos.periodo_fim);
  return jsonb_build_object('mudou', true, 'primeiro', v_primeiro);
end;
$$;
revoke all on function public.registrar_pagamento_mp(uuid, forma_assinatura, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_pagamento_mp(uuid, forma_assinatura, text, text, numeric, jsonb) to service_role;
