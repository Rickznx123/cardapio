-- 016: controle de estoque por quantidade, sem custo ou valor contábil.

create table public.estoque_itens (
  item_id uuid primary key references public.itens(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  controlado boolean not null default false,
  quantidade integer not null default 0 check (quantidade >= 0),
  minimo integer not null default 0 check (minimo >= 0),
  indisponivel_zerado boolean not null default false,
  bloqueio_automatico boolean not null default false
);
create index estoque_itens_empresa on public.estoque_itens (empresa_id, controlado, item_id);

create table public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  item_id uuid references public.itens(id) on delete set null,
  item_nome text not null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  tipo text not null check (tipo in ('entrada', 'saida_manual', 'perda', 'ajuste', 'venda', 'devolucao_cancelamento')),
  quantidade integer not null check (quantidade <> 0),
  saldo_resultante integer not null check (saldo_resultante >= 0),
  usuario_id uuid references auth.users(id) on delete set null,
  usuario_nome text not null,
  observacao text,
  created_at timestamptz not null default now()
);
create index estoque_movimentacoes_item_data on public.estoque_movimentacoes (empresa_id, item_id, created_at desc);
create unique index estoque_movimentacoes_venda_unica
  on public.estoque_movimentacoes (pedido_id, item_id) where tipo = 'venda' and pedido_id is not null and item_id is not null;
create unique index estoque_movimentacoes_devolucao_unica
  on public.estoque_movimentacoes (pedido_id, item_id) where tipo = 'devolucao_cancelamento' and pedido_id is not null and item_id is not null;

alter table public.estoque_itens enable row level security;
alter table public.estoque_movimentacoes enable row level security;
create policy "equipe le estoque" on public.estoque_itens for select using (public.e_membro(empresa_id));
create policy "equipe le historico estoque" on public.estoque_movimentacoes for select using (public.e_membro(empresa_id));
revoke all on public.estoque_itens, public.estoque_movimentacoes from public, anon, authenticated;
grant select on public.estoque_itens, public.estoque_movimentacoes to authenticated;

-- Pedidos públicos de entrega/retirada precisam estar pendentes antes da inserção dos itens.
create or replace function public._pedido_estoque_aguarda_aceite()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.origem = 'web' and new.tipo in ('entrega', 'retirada') then
    new.aceite_pendente := true;
  end if;
  return new;
end;
$$;
revoke all on function public._pedido_estoque_aguarda_aceite() from public, anon, authenticated;
create trigger pedidos_estoque_aguarda_aceite
  before insert on public.pedidos
  for each row execute function public._pedido_estoque_aguarda_aceite();

create or replace function public._pedido_exige_baixa_estoque()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.aceite_pendente and not new.aceite_pendente and new.status <> 'cancelado'
    and exists (
      select 1 from public.pedido_itens pi
      join public.estoque_itens ei on ei.item_id = pi.item_id and ei.controlado
      where pi.pedido_id = old.id
    )
    and not exists (
      select 1 from public.estoque_movimentacoes
      where pedido_id = old.id and tipo = 'venda'
    ) then
    raise exception 'Confirme o pedido pela ação de aceite para baixar o estoque';
  end if;
  return new;
end;
$$;
revoke all on function public._pedido_exige_baixa_estoque() from public, anon, authenticated;
create trigger pedidos_exige_baixa_estoque
  before update of aceite_pendente on public.pedidos
  for each row execute function public._pedido_exige_baixa_estoque();

create or replace function public._estoque_sincronizar_disponibilidade()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_disponivel boolean;
begin
  select disponivel into v_disponivel from public.itens where id = new.item_id;
  if not found then return null; end if;

  if new.controlado and new.indisponivel_zerado and new.quantidade = 0 then
    if v_disponivel then
      update public.itens set disponivel = false where id = new.item_id;
      update public.estoque_itens set bloqueio_automatico = true
      where item_id = new.item_id and not bloqueio_automatico;
    end if;
  elsif new.bloqueio_automatico then
    update public.itens set disponivel = true where id = new.item_id;
    update public.estoque_itens set bloqueio_automatico = false
    where item_id = new.item_id and bloqueio_automatico;
  end if;
  return null;
end;
$$;
revoke all on function public._estoque_sincronizar_disponibilidade() from public, anon, authenticated;
create trigger estoque_sincronizar_disponibilidade
  after insert or update of controlado, quantidade, indisponivel_zerado on public.estoque_itens
  for each row execute function public._estoque_sincronizar_disponibilidade();

create or replace function public._estoque_proteger_disponibilidade()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.disponivel then
    perform 1 from public.estoque_itens
    where item_id = new.id and controlado and indisponivel_zerado and quantidade = 0;
    if found then new.disponivel := false; end if;
  end if;
  return new;
end;
$$;
revoke all on function public._estoque_proteger_disponibilidade() from public, anon, authenticated;
create trigger itens_proteger_disponibilidade_estoque
  before update of disponivel on public.itens
  for each row execute function public._estoque_proteger_disponibilidade();

create or replace function public.configurar_estoque_item(
  p_item_id uuid,
  p_controlado boolean,
  p_minimo integer,
  p_indisponivel_zerado boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa uuid;
begin
  if p_controlado is null or p_indisponivel_zerado is null then raise exception 'Configuração de estoque inválida'; end if;
  if p_minimo is null or p_minimo < 0 then raise exception 'A quantidade mínima não pode ser negativa'; end if;
  select empresa_id into v_empresa from public.itens where id = p_item_id;
  if not found then raise exception 'Item não encontrado'; end if;
  if not public.e_membro(v_empresa, '{dono}') then raise exception 'Sem permissão'; end if;

  insert into public.estoque_itens (item_id, empresa_id, controlado, minimo, indisponivel_zerado)
  values (p_item_id, v_empresa, p_controlado, p_minimo, p_indisponivel_zerado)
  on conflict (item_id) do update
    set controlado = excluded.controlado,
        minimo = excluded.minimo,
        indisponivel_zerado = excluded.indisponivel_zerado
    where public.estoque_itens.empresa_id = excluded.empresa_id;
end;
$$;
revoke all on function public.configurar_estoque_item(uuid, boolean, integer, boolean) from public, anon, authenticated;
grant execute on function public.configurar_estoque_item(uuid, boolean, integer, boolean) to authenticated;

create or replace function public.registrar_movimentacao_estoque(
  p_item_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_observacao text default null
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_estoque public.estoque_itens%rowtype;
  v_item_nome text;
  v_delta integer;
  v_novo integer;
  v_usuario_nome text;
begin
  if p_tipo is null or p_tipo not in ('entrada', 'saida_manual', 'perda', 'ajuste') then
    raise exception 'Tipo de movimentação inválido';
  end if;
  if p_quantidade is null or p_quantidade < 0 or (p_tipo <> 'ajuste' and p_quantidade = 0) then
    raise exception 'Informe uma quantidade válida';
  end if;

  select * into v_estoque from public.estoque_itens where item_id = p_item_id for update;
  if not found then raise exception 'Estoque não configurado para este item'; end if;
  if not v_estoque.controlado then raise exception 'O controle de estoque está desativado para este item'; end if;
  if not public.e_membro(v_estoque.empresa_id, '{dono}') then raise exception 'Sem permissão'; end if;

  select nome into v_item_nome from public.itens where id = p_item_id;
  if not found then raise exception 'Item não encontrado'; end if;
  v_delta := case p_tipo
    when 'entrada' then p_quantidade
    when 'saida_manual' then -p_quantidade
    when 'perda' then -p_quantidade
    else p_quantidade - v_estoque.quantidade
  end;
  v_novo := v_estoque.quantidade + v_delta;
  if v_novo < 0 then
    raise exception 'Saldo insuficiente para "%": disponível %, solicitado %',
      v_item_nome, v_estoque.quantidade, p_quantidade;
  end if;
  if v_delta = 0 then return v_estoque.quantidade; end if;

  update public.estoque_itens set quantidade = v_novo where item_id = p_item_id;
  select nome into v_usuario_nome from public.membros
  where empresa_id = v_estoque.empresa_id and user_id = auth.uid() and ativo limit 1;
  insert into public.estoque_movimentacoes
    (empresa_id, item_id, item_nome, tipo, quantidade, saldo_resultante, usuario_id, usuario_nome, observacao)
  values
    (v_estoque.empresa_id, p_item_id, v_item_nome, p_tipo, v_delta, v_novo, auth.uid(),
     coalesce(v_usuario_nome, 'Sistema'), nullif(trim(p_observacao), ''));
  return v_novo;
end;
$$;
revoke all on function public.registrar_movimentacao_estoque(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.registrar_movimentacao_estoque(uuid, text, integer, text) to authenticated;

create or replace function public._estoque_processar_pedido(p_pedido uuid, p_consumir boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ped public.pedidos%rowtype;
  v_linha record;
  v_estoque public.estoque_itens%rowtype;
  v_item_nome text;
  v_item_disponivel boolean;
  v_novo integer;
  v_usuario_nome text;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  if p_consumir and exists (
    select 1 from public.estoque_movimentacoes
    where pedido_id = p_pedido and tipo = 'venda'
  ) then return; end if;

  -- A primeira passagem bloqueia todos os estoques em ordem estável e valida o pedido
  -- antes de qualquer baixa, evitando saldo parcial e venda simultânea da última unidade.
  for v_linha in
    select pi.item_id, sum(pi.quantidade)::integer as quantidade
    from public.pedido_itens pi
    join public.estoque_itens ei on ei.item_id = pi.item_id and ei.controlado
    where pi.pedido_id = p_pedido and pi.item_id is not null
    group by pi.item_id
    order by pi.item_id
  loop
    select * into v_estoque from public.estoque_itens
    where item_id = v_linha.item_id and controlado for update;
    select nome, disponivel into v_item_nome, v_item_disponivel from public.itens
    where id = v_linha.item_id;
    if not v_item_disponivel then
      raise exception using errcode = 'PZ001',
        message = format('Item indisponível: %s', coalesce(v_item_nome, 'item removido'));
    end if;
    if v_estoque.quantidade < v_linha.quantidade then
      select nome into v_item_nome from public.itens where id = v_linha.item_id;
      raise exception using
        errcode = 'PZ001',
        message = format('Estoque insuficiente para "%s": disponível %s, solicitado %s',
                         coalesce(v_item_nome, 'item removido'), v_estoque.quantidade, v_linha.quantidade);
    end if;
  end loop;

  if not p_consumir then return; end if;

  for v_linha in
    select pi.item_id, sum(pi.quantidade)::integer as quantidade
    from public.pedido_itens pi
    join public.estoque_itens ei on ei.item_id = pi.item_id and ei.controlado
    where pi.pedido_id = p_pedido and pi.item_id is not null
    group by pi.item_id
    order by pi.item_id
  loop
    select * into v_estoque from public.estoque_itens where item_id = v_linha.item_id;
    v_novo := v_estoque.quantidade - v_linha.quantidade;
    update public.estoque_itens set quantidade = v_novo where item_id = v_linha.item_id;
    select nome into v_item_nome from public.itens where id = v_linha.item_id;
    select nome into v_usuario_nome from public.membros
    where empresa_id = v_ped.empresa_id and user_id = auth.uid() and ativo limit 1;
    insert into public.estoque_movimentacoes
      (empresa_id, item_id, item_nome, pedido_id, tipo, quantidade, saldo_resultante, usuario_id, usuario_nome)
    values
      (v_ped.empresa_id, v_linha.item_id, coalesce(v_item_nome, 'Item removido'), p_pedido, 'venda',
       -v_linha.quantidade, v_novo, auth.uid(), coalesce(v_usuario_nome, 'Sistema'));
  end loop;
end;
$$;
revoke all on function public._estoque_processar_pedido(uuid, boolean) from public, anon, authenticated;

create or replace function public._estoque_devolver_pedido(p_pedido uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ped public.pedidos%rowtype;
  v_venda record;
  v_estoque public.estoque_itens%rowtype;
  v_novo integer;
  v_usuario_nome text;
begin
  select * into v_ped from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado'; end if;

  for v_venda in
    select m.item_id, m.item_nome, -m.quantidade as quantidade
    from public.estoque_movimentacoes m
    where m.pedido_id = p_pedido and m.tipo = 'venda' and m.item_id is not null
      and not exists (
        select 1 from public.estoque_movimentacoes d
        where d.pedido_id = m.pedido_id and d.item_id = m.item_id and d.tipo = 'devolucao_cancelamento'
      )
    order by m.item_id
  loop
    select * into v_estoque from public.estoque_itens where item_id = v_venda.item_id for update;
    if not found then continue; end if;
    v_novo := v_estoque.quantidade + v_venda.quantidade;
    update public.estoque_itens set quantidade = v_novo where item_id = v_venda.item_id;
    select nome into v_usuario_nome from public.membros
    where empresa_id = v_ped.empresa_id and user_id = auth.uid() and ativo limit 1;
    insert into public.estoque_movimentacoes
      (empresa_id, item_id, item_nome, pedido_id, tipo, quantidade, saldo_resultante, usuario_id, usuario_nome)
    values
      (v_ped.empresa_id, v_venda.item_id, v_venda.item_nome, p_pedido, 'devolucao_cancelamento',
       v_venda.quantidade, v_novo, auth.uid(), coalesce(v_usuario_nome, 'Sistema'));
  end loop;
end;
$$;
revoke all on function public._estoque_devolver_pedido(uuid) from public, anon, authenticated;

-- Baixa no momento da criação para pedidos confirmados e valida sem reservar os web pendentes.
create or replace function public._adicionar_itens(p_pedido uuid, p_empresa uuid, p_itens jsonb)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_el jsonb;
  v_item public.itens%rowtype;
  v_qtd integer;
  v_ponto text;
  v_sub numeric(10,2) := 0;
  v_pendente boolean;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Pedido sem itens';
  end if;

  for v_el in select * from jsonb_array_elements(p_itens) loop
    v_qtd := coalesce((v_el->>'quantidade')::integer, 1);
    if v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;

    select * into v_item from public.itens
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

    insert into public.pedido_itens (pedido_id, empresa_id, item_id, nome, preco, quantidade, observacao, ponto_carne)
    values (p_pedido, p_empresa, v_item.id, v_item.nome, v_item.preco, v_qtd,
            nullif(v_el->>'observacao', ''), v_ponto);
    v_sub := v_sub + v_item.preco * v_qtd;
  end loop;

  select aceite_pendente into v_pendente from public.pedidos where id = p_pedido;
  perform public._estoque_processar_pedido(p_pedido, not coalesce(v_pendente, false));
  return v_sub;
end;
$$;
revoke all on function public._adicionar_itens(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public._aceitar_pedido_interno(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_ped public.pedidos%rowtype;
  v_motivo text;
begin
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_ped.origem <> 'web' or v_ped.tipo not in ('entrega', 'retirada') then
    raise exception 'Somente pedidos web de entrega ou retirada podem ser aceitos por esta ação';
  end if;
  if not v_ped.aceite_pendente then return false; end if;

  begin
    perform public._estoque_processar_pedido(p_id, true);
  exception when sqlstate 'PZ001' then
    get stacked diagnostics v_motivo = message_text;
    if v_ped.cupom_id is not null then
      update public.cupons set usos = greatest(usos - 1, 0) where id = v_ped.cupom_id;
      update public.recuperador_envios set convertido_pedido_id = null where convertido_pedido_id = p_id;
    end if;
    update public.pedidos
    set status = 'cancelado', aceite_pendente = false, cancelamento_motivo = v_motivo
    where id = p_id;
    return false;
  end;

  update public.pedidos set status = 'preparo', aceite_pendente = false, aceito_em = now() where id = p_id;
  return true;
end;
$$;
revoke all on function public._aceitar_pedido_interno(uuid) from public, anon, authenticated;

create or replace function public.aceitar_pedido(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.pedidos where id = p_id;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not public.e_membro(v_empresa, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  return public._aceitar_pedido_interno(p_id);
end;
$$;
revoke all on function public.aceitar_pedido(uuid) from public, anon, authenticated;
grant execute on function public.aceitar_pedido(uuid) to authenticated;

create or replace function public.aceitar_pedidos_expirados()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_ped record;
  v_quantidade integer := 0;
begin
  for v_ped in
    select id from public.pedidos
    where aceite_pendente and origem = 'web' and tipo in ('entrega', 'retirada')
      and created_at <= now() - interval '5 minutes'
    order by created_at, id
  loop
    if public._aceitar_pedido_interno(v_ped.id) then v_quantidade := v_quantidade + 1; end if;
  end loop;
  return v_quantidade;
end;
$$;
revoke all on function public.aceitar_pedidos_expirados() from public, anon, authenticated;

create or replace function public.cancelar_pedido(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_ped public.pedidos%rowtype;
begin
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not public.e_membro(v_ped.empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  if v_ped.status = 'cancelado' then return; end if;

  if v_ped.comanda_id is not null then
    update public.comandas set total = greatest(total - v_ped.total, 0)
    where id = v_ped.comanda_id and status = 'aberta';
    if not found then raise exception 'Comanda já fechada'; end if;
  end if;
  perform public._estoque_devolver_pedido(p_id);
  if v_ped.cupom_id is not null then
    update public.cupons set usos = greatest(usos - 1, 0) where id = v_ped.cupom_id;
    update public.recuperador_envios set convertido_pedido_id = null where convertido_pedido_id = p_id;
  end if;
  update public.pedidos set status = 'cancelado', aceite_pendente = false where id = p_id;
end;
$$;
revoke all on function public.cancelar_pedido(uuid) from public, anon, authenticated;
grant execute on function public.cancelar_pedido(uuid) to authenticated;

create or replace function public.recusar_pedido(p_id uuid, p_motivo text default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_ped public.pedidos%rowtype;
begin
  select * into v_ped from public.pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if not public.e_membro(v_ped.empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  if v_ped.origem <> 'web' or v_ped.tipo not in ('entrega', 'retirada') then
    raise exception 'Somente pedidos web de entrega ou retirada podem ser recusados por esta ação';
  end if;
  if not v_ped.aceite_pendente then return false; end if;

  perform public._estoque_devolver_pedido(p_id);
  if v_ped.cupom_id is not null then
    update public.cupons set usos = greatest(usos - 1, 0) where id = v_ped.cupom_id;
    update public.recuperador_envios set convertido_pedido_id = null where convertido_pedido_id = p_id;
  end if;
  update public.pedidos
  set status = 'cancelado', aceite_pendente = false, cancelamento_motivo = nullif(trim(p_motivo), '')
  where id = p_id;
  return true;
end;
$$;
revoke all on function public.recusar_pedido(uuid, text) from public, anon, authenticated;
grant execute on function public.recusar_pedido(uuid, text) to authenticated;
