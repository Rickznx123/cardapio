-- 005: painel unificado — pagamento, origem do pedido, pedido de balcão, dados extras da empresa.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 004).

-- ---------- TIPOS ----------
create type forma_pagamento as enum ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito');
create type origem_pedido   as enum ('web', 'garcom', 'balcao');

-- ---------- COLUNAS ----------
alter table pedidos
  add column forma_pagamento forma_pagamento,
  add column troco_para      numeric(10,2) check (troco_para is null or troco_para >= 0),
  add column pago            boolean not null default false,
  add column pago_em         timestamptz,
  add column origem          origem_pedido not null default 'web';

-- Pedidos antigos de mesa vieram do garçom.
update pedidos set origem = 'garcom' where tipo = 'mesa';

alter table empresas
  add column capa_url      text,
  add column descricao     text,
  add column horario_texto text;

-- "painel" vira rota do sistema: entra na lista de slugs reservados.
alter table empresas drop constraint empresas_slug_valido;
alter table empresas add constraint empresas_slug_valido check (
  slug ~ '^[a-z0-9-]{3,40}$'
  and slug not in ('admin', 'login', 'api', 'balcao', 'garcom', 'pedido', 'painel', '_next', 'icons')
);

-- ---------- RPCs DE PEDIDO ----------

-- Interna: valida e cria pedido de entrega/retirada (web ou balcão). Preço sempre do banco.
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
revoke all on function public._criar_pedido_externo(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, origem_pedido, boolean)
  from public, anon, authenticated;

-- Pedido do cardápio público: agora exige forma de pagamento (troco opcional, só dinheiro).
drop function if exists public.criar_pedido_publico(text, tipo_pedido, jsonb, text, text, text, uuid, text);

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
  p_troco_para       numeric default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_emp empresas%rowtype;
begin
  select * into v_emp from empresas where slug = p_slug and ativo;
  if not found then raise exception 'Empresa não encontrada'; end if;
  if not v_emp.aberto then raise exception 'Loja fechada no momento'; end if;
  if p_forma_pagamento is null then raise exception 'Informe a forma de pagamento'; end if;
  if p_tipo = 'entrega' and not v_emp.aceita_entrega then raise exception 'Empresa não faz entrega'; end if;
  if p_tipo = 'retirada' and not v_emp.aceita_retirada then raise exception 'Empresa não aceita retirada'; end if;

  return _criar_pedido_externo(v_emp.id, p_tipo, p_itens, p_cliente_nome, p_cliente_telefone, p_endereco,
                               p_bairro_id, p_observacao, p_forma_pagamento, p_troco_para, 'web', true);
end;
$$;
grant execute on function public.criar_pedido_publico(text, tipo_pedido, jsonb, text, text, forma_pagamento, text, uuid, text, numeric)
  to anon, authenticated;

-- Pedido lançado no painel (dono/caixa): retirada (cliente opcional) ou entrega (cliente obrigatório).
-- Não checa loja aberta nem aceita_entrega/retirada: é a equipe lançando (ex.: pedido por telefone).
create or replace function public.criar_pedido_balcao(
  p_empresa_id       uuid,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text default null,
  p_cliente_telefone text default null,
  p_endereco         text default null,
  p_bairro_id        uuid default null,
  p_observacao       text default null,
  p_forma_pagamento  forma_pagamento default null,
  p_troco_para       numeric default null
)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not e_membro(p_empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  return _criar_pedido_externo(p_empresa_id, p_tipo, p_itens, p_cliente_nome, p_cliente_telefone, p_endereco,
                               p_bairro_id, p_observacao, p_forma_pagamento, p_troco_para, 'balcao',
                               p_tipo = 'entrega');
end;
$$;
grant execute on function public.criar_pedido_balcao(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric)
  to authenticated;

-- Pedido do garçom: igual ao anterior, agora grava origem 'garcom'.
create or replace function public.criar_pedido_mesa(
  p_mesa_id     uuid,
  p_itens       jsonb,
  p_observacao  text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_mesa     mesas%rowtype;
  v_membro   uuid;
  v_comanda  uuid;
  v_numero   integer;
  v_pedido   uuid;
  v_sub      numeric(10,2);
begin
  select * into v_mesa from mesas where id = p_mesa_id and ativo;
  if not found then raise exception 'Mesa não encontrada'; end if;

  select id into v_membro from membros
  where empresa_id = v_mesa.empresa_id and user_id = auth.uid() and ativo;
  if v_membro is null then raise exception 'Sem permissão'; end if;

  select id into v_comanda from comandas where mesa_id = v_mesa.id and status = 'aberta';
  if v_comanda is null then
    insert into comandas (empresa_id, mesa_id) values (v_mesa.empresa_id, v_mesa.id)
    returning id into v_comanda;
  end if;

  update empresas set ultimo_pedido = ultimo_pedido + 1 where id = v_mesa.empresa_id
  returning ultimo_pedido into v_numero;

  insert into pedidos (empresa_id, numero, tipo, comanda_id, membro_id, observacao, origem)
  values (v_mesa.empresa_id, v_numero, 'mesa', v_comanda, v_membro, nullif(p_observacao, ''), 'garcom')
  returning id into v_pedido;

  v_sub := _adicionar_itens(v_pedido, v_mesa.empresa_id, p_itens);

  update pedidos  set subtotal = v_sub, total = v_sub where id = v_pedido;
  update comandas set total = total + v_sub where id = v_comanda;

  return json_build_object('id', v_pedido, 'numero', v_numero, 'comanda_id', v_comanda, 'total', v_sub);
end;
$$;

-- Fecha a comanda e marca como pagos os pedidos dela (não cancelados), numa transação só.
create or replace function public.fechar_comanda(p_comanda_id uuid, p_forma_pagamento forma_pagamento)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_com comandas%rowtype;
begin
  select * into v_com from comandas where id = p_comanda_id for update;
  if not found then raise exception 'Comanda não encontrada'; end if;
  if not e_membro(v_com.empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  if v_com.status <> 'aberta' then raise exception 'Comanda já fechada'; end if;
  if p_forma_pagamento is null then raise exception 'Informe a forma de pagamento'; end if;

  update pedidos set pago = true, pago_em = now(), forma_pagamento = p_forma_pagamento
  where comanda_id = p_comanda_id and status <> 'cancelado' and not pago;

  update comandas set status = 'fechada', fechada_em = now() where id = p_comanda_id;
end;
$$;
grant execute on function public.fechar_comanda(uuid, forma_pagamento) to authenticated;

-- Acompanhamento público: passa a devolver forma de pagamento, troco e pago.
create or replace function public.ver_pedido_publico(p_slug text, p_id uuid)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object(
    'numero', p.numero, 'tipo', p.tipo, 'status', p.status, 'bairro_nome', p.bairro_nome,
    'taxa', p.taxa_entrega, 'subtotal', p.subtotal, 'total', p.total, 'created_at', p.created_at,
    'forma_pagamento', p.forma_pagamento, 'troco_para', p.troco_para, 'pago', p.pago,
    'itens', coalesce((
      select json_agg(json_build_object('nome', i.nome, 'preco', i.preco,
                                        'quantidade', i.quantidade, 'observacao', i.observacao))
      from pedido_itens i where i.pedido_id = p.id
    ), '[]'::json)
  )
  from pedidos p join empresas e on e.id = p.empresa_id
  where p.id = p_id and e.slug = p_slug and p.tipo <> 'mesa';
$$;

-- Policy de update em pedidos (dono/caixa podem mudar pago, pago_em, forma_pagamento e status,
-- exceto para 'cancelado') já está correta desde a 004 — nada a mudar aqui.
