-- =====================================================================
-- CARDÁPIO DIGITAL — schema Supabase (multi-tenant)
-- Rodar inteiro no SQL Editor do Supabase.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- ENUMS ----------
create type papel_membro  as enum ('dono', 'garcom', 'caixa');
create type tipo_pedido   as enum ('mesa', 'entrega', 'retirada');
create type status_pedido as enum ('novo', 'preparo', 'pronto', 'entregue', 'cancelado');
create type status_comanda as enum ('aberta', 'fechada');

-- ---------- TABELAS ----------
create table empresas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  slug             text not null unique             -- seudominio.com/slug
                   constraint empresas_slug_valido check (
                     slug ~ '^[a-z0-9-]{3,40}$'
                     and slug not in ('admin', 'login', 'api', 'balcao', 'garcom', 'pedido', '_next', 'icons')
                   ),
  logo_url         text,
  cor_primaria     text default '#E11D48',
  whatsapp         text,                            -- 55DDDNUMERO
  endereco         text,
  aceita_entrega   boolean not null default true,
  aceita_retirada  boolean not null default true,
  aberto           boolean not null default true,   -- loja aberta p/ pedidos
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
  created_at        timestamptz not null default now(),
  unique (empresa_id, numero)
);
create index pedidos_empresa_status on pedidos (empresa_id, status, created_at desc);

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

-- Pedido do cardápio público (entrega / retirada)
create or replace function public.criar_pedido_publico(
  p_slug             text,
  p_tipo             tipo_pedido,
  p_itens            jsonb,
  p_cliente_nome     text,
  p_cliente_telefone text,
  p_endereco         text default null,
  p_bairro_id        uuid default null,
  p_observacao       text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_emp     empresas%rowtype;
  v_bairro  bairros%rowtype;
  v_numero  integer;
  v_pedido  uuid;
  v_sub     numeric(10,2);
  v_taxa    numeric(10,2) := 0;
begin
  select * into v_emp from empresas where slug = p_slug and ativo;
  if not found then raise exception 'Empresa não encontrada'; end if;
  if not v_emp.aberto then raise exception 'Loja fechada no momento'; end if;

  if p_tipo = 'mesa' then raise exception 'Tipo inválido'; end if;
  if coalesce(trim(p_cliente_nome), '') = '' or coalesce(trim(p_cliente_telefone), '') = '' then
    raise exception 'Informe nome e telefone';
  end if;

  if p_tipo = 'entrega' then
    if not v_emp.aceita_entrega then raise exception 'Empresa não faz entrega'; end if;
    select * into v_bairro from bairros where id = p_bairro_id and empresa_id = v_emp.id and ativo;
    if not found then raise exception 'Bairro não atendido'; end if;
    if coalesce(trim(p_endereco), '') = '' then raise exception 'Informe o endereço'; end if;
    v_taxa := v_bairro.taxa;
  elsif not v_emp.aceita_retirada then
    raise exception 'Empresa não aceita retirada';
  end if;

  update empresas set ultimo_pedido = ultimo_pedido + 1 where id = v_emp.id returning ultimo_pedido into v_numero;

  insert into pedidos (empresa_id, numero, tipo, cliente_nome, cliente_telefone, endereco,
                       bairro_id, bairro_nome, taxa_entrega, observacao)
  values (v_emp.id, v_numero, p_tipo, trim(p_cliente_nome), trim(p_cliente_telefone), p_endereco,
          v_bairro.id, v_bairro.nome, v_taxa, nullif(p_observacao, ''))
  returning id into v_pedido;

  v_sub := _adicionar_itens(v_pedido, v_emp.id, p_itens);

  if p_tipo = 'entrega' and v_sub < v_bairro.pedido_minimo then
    raise exception 'Pedido mínimo para este bairro: R$ %', v_bairro.pedido_minimo;
  end if;

  update pedidos set subtotal = v_sub, total = v_sub + v_taxa where id = v_pedido;

  return json_build_object('id', v_pedido, 'numero', v_numero, 'subtotal', v_sub,
                           'taxa_entrega', v_taxa, 'total', v_sub + v_taxa);
end;
$$;
grant execute on function public.criar_pedido_publico(text, tipo_pedido, jsonb, text, text, text, uuid, text) to anon, authenticated;

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

  insert into pedidos (empresa_id, numero, tipo, comanda_id, membro_id, observacao)
  values (v_mesa.empresa_id, v_numero, 'mesa', v_comanda, v_membro, nullif(p_observacao, ''))
  returning id into v_pedido;

  v_sub := _adicionar_itens(v_pedido, v_mesa.empresa_id, p_itens);

  update pedidos  set subtotal = v_sub, total = v_sub where id = v_pedido;
  update comandas set total = total + v_sub where id = v_comanda;

  return json_build_object('id', v_pedido, 'numero', v_numero, 'comanda_id', v_comanda, 'total', v_sub);
end;
$$;
grant execute on function public.criar_pedido_mesa(uuid, jsonb, text) to authenticated;

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
