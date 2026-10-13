-- =====================================================================
-- CARDÁPIO DIGITAL — schema Supabase (multi-tenant)
-- Rodar inteiro no SQL Editor do Supabase.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
create type papel_membro  as enum ('dono', 'garcom', 'caixa');
create type tipo_pedido   as enum ('mesa', 'entrega', 'retirada');
create type status_pedido as enum ('novo', 'preparo', 'pronto', 'saiu', 'entregue', 'cancelado');  -- saiu: só entrega
create type status_comanda as enum ('aberta', 'fechada');
create type forma_pagamento as enum ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito');
create type origem_pedido as enum ('web', 'garcom', 'balcao');
create type status_caixa   as enum ('aberto', 'fechado');
create type tipo_movimento as enum ('sangria', 'suprimento');

-- ---------- TABELAS ----------
create table empresas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  slug             text not null unique             -- seudominio.com/slug
                   constraint empresas_slug_valido check (
                     slug ~ '^[a-z0-9-]{3,40}$'
                     and slug not in ('admin', 'login', 'api', 'balcao', 'garcom', 'pedido', 'painel', '_next', 'icons')
                   ),
  logo_url         text,
  capa_url         text,
  descricao        text,
  horario_texto    text,                            -- ex.: "Ter a Dom, 18h às 23h"
  cor_primaria     text default '#E11D48',
  whatsapp         text,                            -- 55DDDNUMERO
  endereco         text,
  aceita_entrega   boolean not null default true,
  aceita_retirada  boolean not null default true,
  aberto           boolean not null default true,   -- loja aberta p/ pedidos
  formas_pagamento text[] not null default '{dinheiro,pix,cartao_credito,cartao_debito}'
                   constraint empresas_formas_validas check (
                     cardinality(formas_pagamento) >= 1
                     and formas_pagamento <@ array['dinheiro', 'pix', 'cartao_credito', 'cartao_debito']
                   ),
  tempo_entrega_min integer check (tempo_entrega_min >= 0),   -- minutos
  tempo_entrega_max integer check (tempo_entrega_max >= 0),
  tempo_retirada    integer check (tempo_retirada >= 0),
  horarios         jsonb,                           -- {"sab": [{"abre": "18:30", "fecha": "02:00"}], ...} (fecha <= abre: dia seguinte; [] = fechado)
  virada_dia       time not null default '05:00',      -- fim do dia de trabalho (pedido 01:00 conta no dia anterior)
  config_impressao jsonb not null
                   default '{"largura": 80, "vias": 1, "via_cozinha_sem_precos": false, "cabecalho": "", "rodape": ""}',
  ativo            boolean not null default true,   -- assinatura ativa
  ultimo_pedido    integer not null default 0,      -- contador p/ nº do pedido
  created_at       timestamptz not null default now()
);

create table membros (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  papel       papel_membro not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (empresa_id, user_id)
);

create table categorias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  nome        text not null,
  ordem       integer not null default 0,
  ativo       boolean not null default true
);

create table itens (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  categoria_id  uuid not null references categorias(id) on delete cascade,
  nome          text not null,
  descricao     text,
  preco         numeric(10,2) not null check (preco >= 0),
  foto_url      text,
  disponivel    boolean not null default true,      -- false = esgotado
  destaque      boolean not null default false,     -- máx. 10 por empresa (trigger itens_limite_destaques)
  ordem         integer not null default 0,
  created_at    timestamptz not null default now()
);

create table bairros (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  nome           text not null,
  taxa           numeric(10,2) not null default 0 check (taxa >= 0),
  pedido_minimo  numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  ativo          boolean not null default true,
  unique (empresa_id, nome)
);

create table mesas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  numero      integer not null,
  ativo       boolean not null default true,
  unique (empresa_id, numero)
);

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

create table comandas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references empresas(id) on delete cascade,
  mesa_id     uuid not null references mesas(id),
  status      status_comanda not null default 'aberta',
  total       numeric(10,2) not null default 0,
  aberta_em   timestamptz not null default now(),
  fechada_em  timestamptz
);
-- só 1 comanda aberta por mesa
create unique index comanda_aberta_por_mesa on comandas (mesa_id) where status = 'aberta';

create table pedidos (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references empresas(id) on delete cascade,
  numero            integer not null,               -- nº sequencial por empresa
  tipo              tipo_pedido not null,
  status            status_pedido not null default 'novo',
  comanda_id        uuid references comandas(id),
  membro_id         uuid references membros(id),    -- garçom que lançou
  cliente_nome      text,
  cliente_telefone  text,
  endereco          text,
  bairro_id         uuid references bairros(id),
  bairro_nome       text,                           -- snapshot
  taxa_entrega      numeric(10,2) not null default 0,
  subtotal          numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  observacao        text,
  impresso_em       timestamptz,
  forma_pagamento   forma_pagamento,
  troco_para        numeric(10,2) check (troco_para is null or troco_para >= 0),
  pago              boolean not null default false,
  pago_em           timestamptz,
  origem            origem_pedido not null default 'web',
  caixa_id          uuid references caixas(id),       -- caixa em que foi recebido (trigger pedidos_caixa)
  created_at        timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index pedidos_empresa_status on pedidos (empresa_id, status, created_at desc);
create index pedidos_caixa on pedidos (caixa_id);
create index pedidos_empresa_data on pedidos (empresa_id, created_at desc);

create table pedido_itens (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references pedidos(id) on delete cascade,
  empresa_id   uuid not null references empresas(id) on delete cascade,
  item_id      uuid references itens(id) on delete set null,
  nome         text not null,                       -- snapshot
  preco        numeric(10,2) not null,              -- snapshot
  quantidade   integer not null check (quantidade > 0),
  observacao   text
);

-- ---------- LIMITE DE DESTAQUES ----------
-- Máx. 10 itens em destaque por empresa. Trava a linha da empresa para duas edições simultâneas
-- não passarem juntas do limite.
create or replace function public._limite_destaques()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.destaque and (tg_op = 'INSERT' or not old.destaque or old.empresa_id <> new.empresa_id) then
    perform 1 from empresas where id = new.empresa_id for update;
    if (select count(*) from itens where empresa_id = new.empresa_id and destaque and id <> new.id) >= 10 then
      raise exception 'Máximo de 10 itens em destaque';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public._limite_destaques() from public, anon, authenticated;

create trigger itens_limite_destaques
  before insert or update of destaque, empresa_id on itens
  for each row execute function public._limite_destaques();

-- ---------- HELPER DE PERMISSÃO ----------
create or replace function public.e_membro(p_empresa uuid, p_papeis papel_membro[] default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from membros m
    where m.empresa_id = p_empresa
      and m.user_id = auth.uid()
      and m.ativo
      and (p_papeis is null or m.papel = any (p_papeis))
  );
$$;

-- ---------- RLS ----------
alter table empresas     enable row level security;
alter table membros      enable row level security;
alter table categorias   enable row level security;
alter table itens        enable row level security;
alter table bairros      enable row level security;
alter table mesas        enable row level security;
alter table comandas     enable row level security;
alter table pedidos      enable row level security;
alter table pedido_itens enable row level security;
alter table caixas           enable row level security;
alter table caixa_movimentos enable row level security;
-- Leitura para dono/caixa. Escrita só pelas RPCs abaixo (security definer).
create policy "caixa le caixas"     on caixas           for select using (e_membro(empresa_id, '{dono,caixa}'));
create policy "caixa le movimentos" on caixa_movimentos for select using (e_membro(empresa_id, '{dono,caixa}'));


-- Leitura pública do cardápio
create policy "publico le empresas"   on empresas   for select using (ativo or e_membro(id));
create policy "publico le categorias" on categorias for select using (ativo or e_membro(empresa_id));
create policy "publico le itens"      on itens      for select using (true);
create policy "publico le bairros"    on bairros    for select using (ativo or e_membro(empresa_id));

-- Dono gerencia cadastro
create policy "dono edita empresa"    on empresas   for update using (e_membro(id, '{dono}'));
create policy "dono gerencia categ"   on categorias for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));
create policy "dono gerencia itens"   on itens      for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));
create policy "dono gerencia bairros" on bairros    for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));
create policy "dono gerencia mesas"   on mesas      for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));
create policy "dono gerencia membros" on membros    for all using (e_membro(empresa_id, '{dono}')) with check (e_membro(empresa_id, '{dono}'));

-- Equipe (dono, garçom, caixa) lê operação
create policy "equipe le membros"   on membros      for select using (e_membro(empresa_id));
create policy "equipe le mesas"     on mesas        for select using (e_membro(empresa_id));
create policy "equipe le comandas"  on comandas     for select using (e_membro(empresa_id));
create policy "equipe le pedidos"   on pedidos      for select using (e_membro(empresa_id));
create policy "equipe le itens ped" on pedido_itens for select using (e_membro(empresa_id));

-- Caixa/dono atualizam status, impressão e fecham comanda
-- Cancelar só pela RPC cancelar_pedido (security definer), que também desconta da comanda.
create policy "caixa atualiza pedidos"  on pedidos  for update using (e_membro(empresa_id, '{dono,caixa}'))
  with check (e_membro(empresa_id, '{dono,caixa}') and status <> 'cancelado');
create policy "caixa atualiza comandas" on comandas for update using (e_membro(empresa_id, '{dono,caixa}'));

-- Inserção de pedidos SÓ via RPC (preços calculados no servidor).
-- Não existe policy de insert em pedidos/pedido_itens/comandas de propósito.

-- ---------- RPCs DE PEDIDO ----------

-- Interna: adiciona itens ao pedido e devolve subtotal. p_itens = [{item_id, quantidade, observacao}]
create or replace function public._adicionar_itens(p_pedido uuid, p_empresa uuid, p_itens jsonb)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare
  v_el    jsonb;
  v_item  itens%rowtype;
  v_qtd   integer;
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

    insert into pedido_itens (pedido_id, empresa_id, item_id, nome, preco, quantidade, observacao)
    values (p_pedido, p_empresa, v_item.id, v_item.nome, v_item.preco, v_qtd, nullif(v_el->>'observacao', ''));

    v_sub := v_sub + v_item.preco * v_qtd;
  end loop;

  return v_sub;
end;
$$;
revoke all on function public._adicionar_itens(uuid, uuid, jsonb) from public, anon, authenticated;

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
revoke all on function public._criar_pedido_externo(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, origem_pedido, boolean)
  from public, anon, authenticated;

-- Pedido do cardápio público: agora exige forma de pagamento (troco opcional, só dinheiro).
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

-- Pedido do garçom (mesa). Abre comanda se não houver.
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
grant execute on function public.criar_pedido_mesa(uuid, jsonb, text) to authenticated;

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

-- Tela de login do garçom (/[slug]/garcom): lista só id e nome, sem e-mail.
create or replace function public.listar_garcons(p_slug text)
returns table (id uuid, nome text)
language sql stable security definer set search_path = public
as $$
  select m.id, m.nome
  from membros m join empresas e on e.id = m.empresa_id
  where e.slug = p_slug and e.ativo and m.ativo and m.papel = 'garcom'
  order by m.nome;
$$;
grant execute on function public.listar_garcons(text) to anon, authenticated;

-- Acompanhamento do pedido pelo cliente (/[slug]/pedido/[id]). Sem telefone/endereço; só pedidos não-mesa
-- e só se o pedido for da empresa do slug (evita exibir o pedido com a marca de outra loja).
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
grant execute on function public.ver_pedido_publico(text, uuid) to anon, authenticated;

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

-- ---------- CAIXA, RELATÓRIO, LOJA, REORDENAR (007) ----------
-- Ao marcar pago, exige caixa aberto, liga o pedido a ele e grava pago_em com a hora do servidor.
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
      if new.caixa_id is null then raise exception 'Nenhum caixa aberto: abra o caixa para receber'; end if;
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
-- Período [p_inicio, p_fim) nos limites do dia de trabalho (empresas.virada_dia). Faturamento = pedidos não cancelados.
-- Horas no fuso informado; por_dia agrupa por dia de trabalho (desloca pela virada).
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

-- ---------- WHATSAPP ----------
-- Uma instância Evolution por empresa ("cardapio-{empresa_id}"). Escrita só pelo server (service role).
create table whatsapp_conexoes (
  empresa_id    uuid primary key references empresas(id) on delete cascade,
  instancia     text not null unique,
  status        text not null default 'desconectado'
                check (status in ('desconectado', 'aguardando_qr', 'conectado')),
  numero        text,
  conectado_em  timestamptz
);

create table bot_mensagens (
  empresa_id  uuid not null references empresas(id) on delete cascade,
  tipo        text not null check (tipo in ('boas_vindas', 'fazer_pedido', 'ausencia', 'horarios', 'promocoes', 'informacoes',
                                            'pedido_recebido', 'pedido_preparo', 'pedido_saiu', 'pedido_pronto_retirada',
                                            'pedido_cancelado')),
  texto       text not null,
  ativo       boolean not null default true,
  primary key (empresa_id, tipo)
);

create table bot_config (
  empresa_id                uuid primary key references empresas(id) on delete cascade,
  ia_ativa                  boolean not null default false,
  pausa_humano_minutos      integer not null default 30 check (pausa_humano_minutos between 0 and 1440),
  intervalo_saudacao_horas  integer not null default 12 check (intervalo_saudacao_horas between 0 and 720)
);

-- Estado por contato: saudação e pausa quando um atendente responde pelo celular.
create table bot_conversas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references empresas(id) on delete cascade,
  telefone         text not null,
  ultimo_contato   timestamptz not null default now(),
  ultima_saudacao  timestamptz,
  pausado_ate      timestamptz,
  unique (empresa_id, telefone)
);

-- Idempotência: ids de mensagens já tratadas/enviadas e avisos de pedido já mandados.
-- shortcut: cresce sem limite; apagar linhas com mais de 7 dias (pg_cron) quando o volume pesar.
create table whatsapp_eventos (
  id          text primary key,
  created_at  timestamptz not null default now()
);

alter table whatsapp_conexoes enable row level security;
alter table bot_mensagens     enable row level security;
alter table bot_config        enable row level security;
alter table bot_conversas     enable row level security;   -- sem policy: só service role
alter table whatsapp_eventos  enable row level security;   -- sem policy: só service role

create policy "dono le conexao"      on whatsapp_conexoes for select using (e_membro(empresa_id, '{dono}'));
create policy "dono le mensagens"    on bot_mensagens     for select using (e_membro(empresa_id, '{dono}'));
create policy "dono edita mensagens" on bot_mensagens     for update using (e_membro(empresa_id, '{dono}'))
  with check (e_membro(empresa_id, '{dono}'));
create policy "dono le config bot"    on bot_config for select using (e_membro(empresa_id, '{dono}'));
create policy "dono edita config bot" on bot_config for update using (e_membro(empresa_id, '{dono}'))
  with check (e_membro(empresa_id, '{dono}'));

-- ---------- REALTIME (painel do balcão) ----------
alter publication supabase_realtime add table pedidos;

-- ---------- STORAGE (fotos e logos) ----------
-- Caminho dos arquivos: {empresa_id}/arquivo.jpg
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy "dono envia fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.e_membro(((storage.foldername(name))[1])::uuid, '{dono}'));
create policy "dono altera fotos" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.e_membro(((storage.foldername(name))[1])::uuid, '{dono}'));
create policy "dono apaga fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.e_membro(((storage.foldername(name))[1])::uuid, '{dono}'));

-- =====================================================================
-- SEED DE TESTE (rodar depois de criar seu usuário em Authentication > Users)
-- Troque o e-mail abaixo pelo seu.
-- =====================================================================
-- with e as (
--   insert into empresas (nome, slug, whatsapp) values ('Lanchonete Teste', 'teste', '5566999999999')
--   returning id
-- )
-- insert into membros (empresa_id, user_id, nome, papel)
-- select e.id, u.id, 'Rick', 'dono' from e, auth.users u where u.email = 'SEU@EMAIL.COM';
