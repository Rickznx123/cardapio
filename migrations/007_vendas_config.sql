-- 007: caixas (abertura, sangria/suprimento, fechamento), relatório de vendas, configurações da empresa
-- (formas de pagamento aceitas, tempos, horários, impressão), alternar_loja para caixa e reordenar em 1 transação.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 006).

-- ---------- TIPOS ----------
create type status_caixa   as enum ('aberto', 'fechado');
create type tipo_movimento as enum ('sangria', 'suprimento');

-- ---------- CAIXAS ----------
create table caixas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references empresas(id) on delete cascade,
  status              status_caixa not null default 'aberto',
  aberto_por          uuid references membros(id),
  aberto_em           timestamptz not null default now(),
  valor_inicial       numeric(10,2) not null default 0 check (valor_inicial >= 0),
  fechado_por         uuid references membros(id),
  fechado_em          timestamptz,
  valores_informados  jsonb,          -- {"dinheiro": 120.5, "pix": 300, ...} contados no fechamento
  valores_esperados   jsonb,          -- foto do esperado no fechamento (histórico não muda depois)
  observacao          text
);
-- só 1 caixa aberto por empresa
create unique index caixa_aberto_por_empresa on caixas (empresa_id) where status = 'aberto';
create index caixas_empresa_data on caixas (empresa_id, aberto_em desc);

create table caixa_movimentos (
  id          uuid primary key default gen_random_uuid(),
  caixa_id    uuid not null references caixas(id) on delete cascade,
  empresa_id  uuid not null references empresas(id) on delete cascade,
  tipo        tipo_movimento not null,
  valor       numeric(10,2) not null check (valor > 0),
  motivo      text,
  membro_id   uuid references membros(id),
  created_at  timestamptz not null default now()
);
create index caixa_movimentos_caixa on caixa_movimentos (caixa_id);

alter table caixas           enable row level security;
alter table caixa_movimentos enable row level security;
-- Leitura para dono/caixa. Escrita só pelas RPCs abaixo (security definer).
create policy "caixa le caixas"     on caixas           for select using (e_membro(empresa_id, '{dono,caixa}'));
create policy "caixa le movimentos" on caixa_movimentos for select using (e_membro(empresa_id, '{dono,caixa}'));

-- ---------- PEDIDOS: caixa do pagamento ----------
alter table pedidos add column caixa_id uuid references caixas(id);
create index pedidos_caixa on pedidos (caixa_id);
create index pedidos_empresa_data on pedidos (empresa_id, created_at desc);

-- Ao marcar pago, liga o pedido ao caixa aberto e grava pago_em com a hora do servidor.
-- Ao desmarcar, solta. Já pago: caixa_id/pago_em não mudam (nem por update direto do client).
create or replace function public._pedido_caixa()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.pago then
    if tg_op = 'UPDATE' and old.pago then
      new.caixa_id := old.caixa_id;
      new.pago_em  := old.pago_em;
    else
      new.pago_em := now();
      select id into new.caixa_id from caixas where empresa_id = new.empresa_id and status = 'aberto';
    end if;
  else
    if tg_op = 'UPDATE' and old.pago and old.caixa_id is not null
       and exists (select 1 from caixas where id = old.caixa_id and status = 'fechado') then
      raise exception 'Este pagamento já está num caixa fechado';
    end if;
    new.caixa_id := null;
    new.pago_em  := null;
  end if;
  return new;
end;
$$;
revoke all on function public._pedido_caixa() from public, anon, authenticated;
create trigger pedidos_caixa before insert or update on pedidos
  for each row execute function public._pedido_caixa();

-- ---------- EMPRESAS: configurações ----------
alter table empresas
  add column formas_pagamento text[] not null default '{dinheiro,pix,cartao_credito,cartao_debito}'
    constraint empresas_formas_validas check (
      cardinality(formas_pagamento) >= 1
      and formas_pagamento <@ array['dinheiro', 'pix', 'cartao_credito', 'cartao_debito']
    ),
  add column tempo_entrega_min integer check (tempo_entrega_min >= 0),
  add column tempo_entrega_max integer check (tempo_entrega_max >= 0),
  add column tempo_retirada    integer check (tempo_retirada >= 0),
  -- {"seg": {"aberto": true, "abre": "18:00", "fecha": "23:00"}, ...} (dom, seg, ter, qua, qui, sex, sab)
  add column horarios          jsonb,
  -- {"largura": 80, "vias": 1, "via_cozinha_sem_precos": false, "cabecalho": "", "rodape": ""}
  add column config_impressao  jsonb not null
    default '{"largura": 80, "vias": 1, "via_cozinha_sem_precos": false, "cabecalho": "", "rodape": ""}';

-- ---------- HELPERS ----------
-- Membro (dono/caixa) logado na empresa, ou erro.
create or replace function public._membro_caixa(p_empresa uuid)
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare
  v_membro uuid;
begin
  select id into v_membro from membros
  where empresa_id = p_empresa and user_id = auth.uid() and ativo and papel in ('dono', 'caixa');
  if v_membro is null then raise exception 'Sem permissão'; end if;
  return v_membro;
end;
$$;
revoke all on function public._membro_caixa(uuid) from public, anon, authenticated;

-- Resumo de um caixa: entradas por forma (pedidos pagos, não cancelados), sangrias, suprimentos e esperado.
-- Dinheiro esperado = valor inicial + vendas em dinheiro + suprimentos − sangrias.
create or replace function public._resumo_caixa(p_caixa uuid)
returns json
language sql stable security definer set search_path = public
as $$
  with c as (select * from caixas where id = p_caixa),
  entradas as (
    select p.forma_pagamento::text as forma, sum(p.total) as valor, count(*) as pedidos
    from pedidos p where p.caixa_id = p_caixa and p.pago and p.status <> 'cancelado'
    group by 1
  ),
  mov as (
    select coalesce(sum(valor) filter (where tipo = 'sangria'), 0)    as sangrias,
           coalesce(sum(valor) filter (where tipo = 'suprimento'), 0) as suprimentos
    from caixa_movimentos where caixa_id = p_caixa
  )
  select json_build_object(
    'caixa', (select row_to_json(c) from c),
    'aberto_por_nome',  (select m.nome from membros m join c on m.id = c.aberto_por),
    'fechado_por_nome', (select m.nome from membros m join c on m.id = c.fechado_por),
    'entradas', coalesce((select json_object_agg(coalesce(forma, 'a_definir'), valor) from entradas), '{}'::json),
    'qtd_pedidos', coalesce((select sum(pedidos) from entradas), 0),
    'total_vendas', coalesce((select sum(valor) from entradas), 0),
    'sangrias', (select sangrias from mov),
    'suprimentos', (select suprimentos from mov),
    'esperado', coalesce((select valores_esperados::json from c), json_build_object(
      'dinheiro', (select valor_inicial from c) + coalesce((select valor from entradas where forma = 'dinheiro'), 0)
                  + (select suprimentos from mov) - (select sangrias from mov),
      'pix', coalesce((select valor from entradas where forma = 'pix'), 0),
      'cartao_credito', coalesce((select valor from entradas where forma = 'cartao_credito'), 0),
      'cartao_debito', coalesce((select valor from entradas where forma = 'cartao_debito'), 0)
    )),
    'movimentos', coalesce((
      select json_agg(json_build_object('id', mv.id, 'tipo', mv.tipo, 'valor', mv.valor, 'motivo', mv.motivo,
                                        'created_at', mv.created_at, 'membro', m.nome) order by mv.created_at)
      from caixa_movimentos mv left join membros m on m.id = mv.membro_id
      where mv.caixa_id = p_caixa
    ), '[]'::json)
  );
$$;
revoke all on function public._resumo_caixa(uuid) from public, anon, authenticated;

-- ---------- RPCs DE CAIXA (dono/caixa) ----------
create or replace function public.abrir_caixa(p_empresa_id uuid, p_valor_inicial numeric default 0)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_membro uuid := _membro_caixa(p_empresa_id);
  v_caixa  uuid;
begin
  if coalesce(p_valor_inicial, 0) < 0 then raise exception 'Valor inicial inválido'; end if;
  insert into caixas (empresa_id, aberto_por, valor_inicial)
  values (p_empresa_id, v_membro, coalesce(p_valor_inicial, 0))
  returning id into v_caixa;
  return v_caixa;
exception when unique_violation then
  raise exception 'Já existe um caixa aberto';
end;
$$;
grant execute on function public.abrir_caixa(uuid, numeric) to authenticated;

create or replace function public.registrar_movimento(p_empresa_id uuid, p_tipo tipo_movimento, p_valor numeric, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_membro uuid := _membro_caixa(p_empresa_id);
  v_caixa  uuid;
  v_id     uuid;
begin
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  select id into v_caixa from caixas where empresa_id = p_empresa_id and status = 'aberto';
  if v_caixa is null then raise exception 'Nenhum caixa aberto'; end if;
  insert into caixa_movimentos (caixa_id, empresa_id, tipo, valor, motivo, membro_id)
  values (v_caixa, p_empresa_id, p_tipo, p_valor, nullif(trim(p_motivo), ''), v_membro)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.registrar_movimento(uuid, tipo_movimento, numeric, text) to authenticated;

-- Fecha o caixa aberto. Devolve esperado × informado × diferença por forma de pagamento.
create or replace function public.fechar_caixa(p_empresa_id uuid, p_valores_informados jsonb, p_observacao text default null)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_membro   uuid := _membro_caixa(p_empresa_id);
  v_caixa    uuid;
  v_resumo   json;
  v_esperado jsonb;
  v_dif      jsonb := '{}';
  v_forma    text;
begin
  select id into v_caixa from caixas where empresa_id = p_empresa_id and status = 'aberto' for update;
  if v_caixa is null then raise exception 'Nenhum caixa aberto'; end if;
  if p_valores_informados is null or jsonb_typeof(p_valores_informados) <> 'object' then
    raise exception 'Informe os valores contados';
  end if;

  v_resumo   := _resumo_caixa(v_caixa);
  v_esperado := (v_resumo -> 'esperado')::jsonb;
  for v_forma in select jsonb_object_keys(v_esperado) loop
    v_dif := v_dif || jsonb_build_object(v_forma,
      coalesce((p_valores_informados ->> v_forma)::numeric, 0) - (v_esperado ->> v_forma)::numeric);
  end loop;

  update caixas set status = 'fechado', fechado_por = v_membro, fechado_em = now(),
                    valores_informados = p_valores_informados, valores_esperados = v_esperado,
                    observacao = nullif(trim(p_observacao), '')
  where id = v_caixa;

  return json_build_object('caixa_id', v_caixa, 'esperado', v_esperado,
                           'informado', p_valores_informados, 'diferenca', v_dif,
                           'resumo', _resumo_caixa(v_caixa));
end;
$$;
grant execute on function public.fechar_caixa(uuid, jsonb, text) to authenticated;

create or replace function public.resumo_caixa(p_caixa_id uuid)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_emp uuid;
begin
  select empresa_id into v_emp from caixas where id = p_caixa_id;
  if v_emp is null then raise exception 'Caixa não encontrado'; end if;
  perform _membro_caixa(v_emp);
  return _resumo_caixa(p_caixa_id);
end;
$$;
grant execute on function public.resumo_caixa(uuid) to authenticated;

-- ---------- LOJA ABERTA/FECHADA (dono e caixa) ----------
create or replace function public.alternar_loja(p_empresa_id uuid, p_aberto boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  perform _membro_caixa(p_empresa_id);
  update empresas set aberto = p_aberto where id = p_empresa_id;
  return p_aberto;
end;
$$;
grant execute on function public.alternar_loja(uuid, boolean) to authenticated;

-- ---------- REORDENAR (drag-and-drop) numa transação só ----------
create or replace function public.reordenar(p_tabela text, p_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_tabela = 'categorias' then
    if exists (select 1 from categorias where id = any(p_ids) and not e_membro(empresa_id, '{dono}')) then
      raise exception 'Sem permissão';
    end if;
    update categorias c set ordem = o.n - 1
    from unnest(p_ids) with ordinality as o(id, n) where c.id = o.id;
  elsif p_tabela = 'itens' then
    if exists (select 1 from itens where id = any(p_ids) and not e_membro(empresa_id, '{dono}')) then
      raise exception 'Sem permissão';
    end if;
    update itens i set ordem = o.n - 1
    from unnest(p_ids) with ordinality as o(id, n) where i.id = o.id;
  else
    raise exception 'Tabela inválida';
  end if;
end;
$$;
grant execute on function public.reordenar(text, uuid[]) to authenticated;

-- ---------- RELATÓRIO DE VENDAS (dono/caixa) ----------
-- Período [p_inicio, p_fim). Faturamento = pedidos não cancelados. Horas/dias no fuso informado.
create or replace function public.relatorio_vendas(p_empresa_id uuid, p_inicio timestamptz, p_fim timestamptz,
                                                   p_tz text default 'America/Sao_Paulo')
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
        from (select (created_at at time zone p_tz)::date d, sum(total) v, count(*) n from validos group by 1) x
      ), '[]'::json)
    )
  );
end;
$$;
grant execute on function public.relatorio_vendas(uuid, timestamptz, timestamptz, text) to authenticated;

-- ---------- PEDIDOS: forma de pagamento precisa ser aceita pela empresa ----------
-- Mesmo corpo da 005 + checagem de empresas.formas_pagamento (vale para web e balcão).
create or replace function public._criar_pedido_externo(
  p_empresa          uuid,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text,
  p_cliente_telefone text,
  p_endereco         text,
  p_bairro_id        uuid,
  p_observacao       text,
  p_forma            forma_pagamento,
  p_troco_para       numeric,
  p_origem           origem_pedido,
  p_exige_cliente    boolean
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_bairro  bairros%rowtype;
  v_numero  integer;
  v_pedido  uuid;
  v_sub     numeric(10,2);
  v_taxa    numeric(10,2) := 0;
begin
  if p_tipo = 'mesa' then raise exception 'Tipo inválido'; end if;
  if p_exige_cliente and (coalesce(trim(p_cliente_nome), '') = '' or coalesce(trim(p_cliente_telefone), '') = '') then
    raise exception 'Informe nome e telefone';
  end if;
  if p_forma is not null and not exists (
    select 1 from empresas where id = p_empresa and p_forma::text = any(formas_pagamento)
  ) then
    raise exception 'Forma de pagamento não aceita por esta loja';
  end if;
  if p_troco_para is not null and p_forma is distinct from 'dinheiro' then
    raise exception 'Troco só vale para pagamento em dinheiro';
  end if;

  if p_tipo = 'entrega' then
    select * into v_bairro from bairros where id = p_bairro_id and empresa_id = p_empresa and ativo;
    if not found then raise exception 'Bairro não atendido'; end if;
    if coalesce(trim(p_endereco), '') = '' then raise exception 'Informe o endereço'; end if;
    v_taxa := v_bairro.taxa;
  end if;

  update empresas set ultimo_pedido = ultimo_pedido + 1 where id = p_empresa returning ultimo_pedido into v_numero;

  insert into pedidos (empresa_id, numero, tipo, cliente_nome, cliente_telefone, endereco, bairro_id, bairro_nome,
                       taxa_entrega, observacao, forma_pagamento, troco_para, origem)
  values (p_empresa, v_numero, p_tipo, nullif(trim(p_cliente_nome), ''), nullif(trim(p_cliente_telefone), ''),
          case when p_tipo = 'entrega' then trim(p_endereco) end, v_bairro.id, v_bairro.nome,
          v_taxa, nullif(trim(p_observacao), ''), p_forma, p_troco_para, p_origem)
  returning id into v_pedido;

  v_sub := _adicionar_itens(v_pedido, p_empresa, p_itens);

  if p_tipo = 'entrega' and v_sub < v_bairro.pedido_minimo then
    raise exception 'Pedido mínimo para este bairro: R$ %', v_bairro.pedido_minimo;
  end if;
  if p_troco_para is not null and p_troco_para < v_sub + v_taxa then
    raise exception 'O troco deve ser para um valor maior ou igual ao total (R$ %)', v_sub + v_taxa;
  end if;

  update pedidos set subtotal = v_sub, total = v_sub + v_taxa where id = v_pedido;

  return json_build_object('id', v_pedido, 'numero', v_numero, 'subtotal', v_sub,
                           'taxa_entrega', v_taxa, 'total', v_sub + v_taxa);
end;
$$;
