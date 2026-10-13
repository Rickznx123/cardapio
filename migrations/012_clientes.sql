-- 012: clientes (com backfill), cupons de desconto e recuperador de clientes inativos.
-- Rodar no SQL Editor do Supabase em bancos criados antes desta mudança (depois da 011).

-- ---------- TELEFONE NORMALIZADO ----------
-- Só dígitos com 55 (espelha numeroWhats em lib/telefone.ts). Menos de 10 dígitos = null.
create or replace function public.normalizar_telefone(p text)
returns text
language sql immutable set search_path = public
as $$
  select case when length(d) between 10 and 11 then '55' || d when length(d) >= 12 then d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- ---------- CLIENTES ----------
create table clientes (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references empresas(id) on delete cascade,
  telefone               text not null,
  nome                   text,
  endereco               text,
  bairro_id              uuid references bairros(id) on delete set null,
  primeiro_pedido        timestamptz,
  ultimo_pedido          timestamptz,
  total_pedidos          integer not null default 0,          -- só pedidos não cancelados
  total_gasto            numeric(10,2) not null default 0,
  optout_ofertas         boolean not null default false,      -- respondeu SAIR/PARAR
  ultimo_recuperador_em  timestamptz,
  created_at             timestamptz not null default now(),
  unique (empresa_id, telefone)
);
create index clientes_empresa_ultimo on clientes (empresa_id, ultimo_pedido);

alter table clientes enable row level security;
create policy "caixa le clientes" on clientes for select using (e_membro(empresa_id, '{dono,caixa}'));

-- ---------- CUPONS ----------
create table cupons (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  codigo         text not null check (codigo ~ '^[A-Z0-9_-]{3,30}$'),   -- sempre maiúsculo
  tipo           text not null check (tipo in ('percentual', 'valor', 'frete_gratis')),
  valor          numeric(10,2) not null default 0 check (valor >= 0),
  pedido_minimo  numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  validade       timestamptz,                                          -- null = sem validade
  usos_max       integer check (usos_max is null or usos_max > 0),     -- null = ilimitado
  usos           integer not null default 0,
  cliente_id     uuid references clientes(id) on delete cascade,       -- cupom exclusivo
  origem         text not null default 'manual' check (origem in ('manual', 'recuperador')),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (empresa_id, codigo),
  check (tipo <> 'percentual' or valor <= 100)
);

alter table cupons enable row level security;
create policy "caixa le cupons"   on cupons for select using (e_membro(empresa_id, '{dono,caixa}'));
create policy "dono gerencia cupons" on cupons for all using (e_membro(empresa_id, '{dono}'))
  with check (e_membro(empresa_id, '{dono}') and origem = 'manual');

alter table pedidos
  add column cliente_id uuid references clientes(id) on delete set null,
  add column cupom_id   uuid references cupons(id) on delete set null,
  add column desconto   numeric(10,2) not null default 0 check (desconto >= 0);
create index pedidos_cliente on pedidos (cliente_id, created_at desc);
create index pedidos_cupom on pedidos (cupom_id);

-- ---------- BACKFILL (antes dos triggers) ----------
insert into clientes (empresa_id, telefone, nome, endereco, bairro_id)
select distinct on (empresa_id, tel) empresa_id, tel, nullif(trim(cliente_nome), ''), endereco, bairro_id
from (select *, normalizar_telefone(cliente_telefone) as tel from pedidos
      where origem in ('web', 'balcao') and tipo <> 'mesa') p
where tel is not null
order by empresa_id, tel, created_at desc;

update pedidos p set cliente_id = c.id
from clientes c
where c.empresa_id = p.empresa_id and c.telefone = normalizar_telefone(p.cliente_telefone)
  and p.origem in ('web', 'balcao') and p.tipo <> 'mesa';

-- ---------- TOTAIS DO CLIENTE ----------
create or replace function public._recalcular_cliente(p_cliente uuid)
returns void
language sql security definer set search_path = public
as $$
  update clientes c set total_pedidos = x.n, total_gasto = x.v, primeiro_pedido = x.primeiro, ultimo_pedido = x.ultimo
  from (select count(*) as n, coalesce(sum(total), 0) as v, min(created_at) as primeiro, max(created_at) as ultimo
        from pedidos where cliente_id = p_cliente and status <> 'cancelado') x
  where c.id = p_cliente;
$$;
revoke all on function public._recalcular_cliente(uuid) from public, anon, authenticated;

select _recalcular_cliente(id) from clientes;

-- Pedido web/balcão com telefone: upsert do cliente (nome/endereço mais recentes) e liga o pedido a ele.
create or replace function public._pedido_cliente()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tel text := normalizar_telefone(new.cliente_telefone);
begin
  if new.origem in ('web', 'balcao') and new.tipo <> 'mesa' and v_tel is not null then
    insert into clientes (empresa_id, telefone, nome, endereco, bairro_id)
    values (new.empresa_id, v_tel, nullif(trim(new.cliente_nome), ''), new.endereco, new.bairro_id)
    on conflict (empresa_id, telefone) do update set
      nome      = coalesce(excluded.nome, clientes.nome),
      endereco  = coalesce(excluded.endereco, clientes.endereco),
      bairro_id = coalesce(excluded.bairro_id, clientes.bairro_id)
    returning id into new.cliente_id;
  end if;
  return new;
end;
$$;
revoke all on function public._pedido_cliente() from public, anon, authenticated;
create trigger pedidos_cliente before insert on pedidos
  for each row execute function public._pedido_cliente();

-- Contadores: recalcula quando muda status (cancelar), total ou cliente.
create or replace function public._pedido_cliente_totais()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.cliente_id is not null then perform _recalcular_cliente(new.cliente_id); end if;
  if tg_op = 'UPDATE' and old.cliente_id is not null and old.cliente_id is distinct from new.cliente_id then
    perform _recalcular_cliente(old.cliente_id);
  end if;
  return null;
end;
$$;
revoke all on function public._pedido_cliente_totais() from public, anon, authenticated;
create trigger pedidos_cliente_totais after insert or update of status, total, cliente_id on pedidos
  for each row execute function public._pedido_cliente_totais();

-- Checkout: dados salvos do mesmo telefone (só nome, endereço e bairro).
create or replace function public.cliente_por_telefone(p_empresa_id uuid, p_telefone text)
returns json
language sql stable security definer set search_path = public
as $$
  select json_build_object('nome', c.nome, 'endereco', c.endereco, 'bairro_id', c.bairro_id)
  from clientes c
  where c.empresa_id = p_empresa_id and c.telefone = normalizar_telefone(p_telefone) and empresa_liberada(p_empresa_id);
$$;
grant execute on function public.cliente_por_telefone(uuid, text) to anon, authenticated;

-- ---------- CUPOM: validação e desconto (100% no banco) ----------
-- Erro em texto amigável se não valer. p_travar: trava a linha do cupom (criação do pedido).
create or replace function public._calcular_cupom(p_empresa uuid, p_codigo text, p_subtotal numeric, p_taxa numeric,
                                                  p_tipo tipo_pedido, p_telefone text, p_travar boolean)
returns table (cupom_id uuid, desconto numeric)
language plpgsql security definer set search_path = public
as $$
declare
  v_cup  cupons%rowtype;
  v_desc numeric(10,2);
begin
  if p_travar then
    select * into v_cup from cupons where empresa_id = p_empresa and codigo = upper(trim(p_codigo)) for update;
  else
    select * into v_cup from cupons where empresa_id = p_empresa and codigo = upper(trim(p_codigo));
  end if;
  if not found or not v_cup.ativo then raise exception 'Cupom inválido'; end if;
  if v_cup.validade is not null and v_cup.validade <= now() then raise exception 'Este cupom expirou'; end if;
  if v_cup.usos_max is not null and v_cup.usos >= v_cup.usos_max then raise exception 'Este cupom já foi usado'; end if;
  if v_cup.cliente_id is not null and not exists (
    select 1 from clientes
    where id = v_cup.cliente_id and empresa_id = p_empresa
      and telefone = normalizar_telefone(p_telefone)
  ) then
    raise exception 'Este cupom é exclusivo de outro cliente';
  end if;
  if p_subtotal < v_cup.pedido_minimo then raise exception 'Pedido mínimo para este cupom: R$ %', v_cup.pedido_minimo; end if;
  if v_cup.tipo = 'frete_gratis' and p_tipo <> 'entrega' then raise exception 'Cupom de frete grátis só vale para entrega'; end if;

  v_desc := case v_cup.tipo
    when 'percentual' then round(p_subtotal * v_cup.valor / 100, 2)
    when 'valor' then v_cup.valor
    else p_taxa
  end;
  return query select v_cup.id, least(v_desc, p_subtotal);   -- desconto nunca maior que o subtotal
end;
$$;
revoke all on function public._calcular_cupom(uuid, text, numeric, numeric, tipo_pedido, text, boolean) from public, anon, authenticated;

-- Pré-validação ao vivo no checkout (não reserva o cupom; a criação do pedido valida de novo).
create or replace function public.validar_cupom(p_empresa_id uuid, p_codigo text, p_subtotal numeric, p_tipo tipo_pedido,
                                                p_bairro_id uuid default null, p_telefone text default null)
returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v_taxa numeric(10,2) := 0;
  v_res  record;
begin
  if p_tipo = 'entrega' then
    select taxa into v_taxa from bairros where id = p_bairro_id and empresa_id = p_empresa_id and ativo;
  end if;
  select * into v_res from _calcular_cupom(p_empresa_id, p_codigo, coalesce(p_subtotal, 0), coalesce(v_taxa, 0),
                                           p_tipo, p_telefone, false);
  return json_build_object('ok', true, 'codigo', upper(trim(p_codigo)), 'desconto', v_res.desconto);
exception when raise_exception then
  return json_build_object('ok', false, 'erro', sqlerrm);
end;
$$;
grant execute on function public.validar_cupom(uuid, text, numeric, tipo_pedido, uuid, text) to anon, authenticated;

-- ---------- RPCs DE PEDIDO COM CUPOM ----------
drop function if exists public.criar_pedido_publico(text, tipo_pedido, jsonb, text, text, forma_pagamento, text, uuid, text, numeric);
drop function if exists public.criar_pedido_balcao(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric);
drop function if exists public._criar_pedido_externo(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, origem_pedido, boolean);

-- Mesmo corpo da 007 + cupom (desconto no total, uso incrementado na mesma transação, conversão do recuperador).
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
  p_exige_cliente    boolean,
  p_cupom            text
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
  v_cupom   uuid;
  v_desc    numeric(10,2) := 0;
  v_total   numeric(10,2);
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

  if coalesce(trim(p_cupom), '') <> '' then
    select c.cupom_id, c.desconto into v_cupom, v_desc
    from _calcular_cupom(p_empresa, p_cupom, v_sub, v_taxa, p_tipo, p_cliente_telefone, true) c;
    update cupons set usos = usos + 1 where id = v_cupom;
    update recuperador_envios set convertido_pedido_id = v_pedido
    where cupom_id = v_cupom and status = 'enviado' and convertido_pedido_id is null;
  end if;
  v_total := v_sub + v_taxa - v_desc;

  if p_troco_para is not null and p_troco_para < v_total then
    raise exception 'O troco deve ser para um valor maior ou igual ao total (R$ %)', v_total;
  end if;

  update pedidos set subtotal = v_sub, total = v_total, cupom_id = v_cupom, desconto = v_desc where id = v_pedido;

  return json_build_object('id', v_pedido, 'numero', v_numero, 'subtotal', v_sub,
                           'taxa_entrega', v_taxa, 'desconto', v_desc, 'total', v_total);
end;
$$;
revoke all on function public._criar_pedido_externo(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, origem_pedido, boolean, text)
  from public, anon, authenticated;

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
begin
  select * into v_emp from empresas where slug = p_slug and ativo;
  if not found then raise exception 'Empresa não encontrada'; end if;
  if not v_emp.aberto then raise exception 'Loja fechada no momento'; end if;
  if p_forma_pagamento is null then raise exception 'Informe a forma de pagamento'; end if;
  if p_tipo = 'entrega' and not v_emp.aceita_entrega then raise exception 'Empresa não faz entrega'; end if;
  if p_tipo = 'retirada' and not v_emp.aceita_retirada then raise exception 'Empresa não aceita retirada'; end if;

  return _criar_pedido_externo(v_emp.id, p_tipo, p_itens, p_cliente_nome, p_cliente_telefone, p_endereco,
                               p_bairro_id, p_observacao, p_forma_pagamento, p_troco_para, 'web', true, p_cupom);
end;
$$;
grant execute on function public.criar_pedido_publico(text, tipo_pedido, jsonb, text, text, forma_pagamento, text, uuid, text, numeric, text)
  to anon, authenticated;

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
  p_troco_para       numeric default null,
  p_cupom            text default null
)
returns json
language plpgsql security definer set search_path = public
as $$
begin
  if not e_membro(p_empresa_id, '{dono,caixa}') then raise exception 'Sem permissão'; end if;
  return _criar_pedido_externo(p_empresa_id, p_tipo, p_itens, p_cliente_nome, p_cliente_telefone, p_endereco,
                               p_bairro_id, p_observacao, p_forma_pagamento, p_troco_para, 'balcao',
                               p_tipo = 'entrega', p_cupom);
end;
$$;
grant execute on function public.criar_pedido_balcao(uuid, tipo_pedido, jsonb, text, text, text, uuid, text, forma_pagamento, numeric, text)
  to authenticated;

-- Cancelar devolve o uso do cupom (e desfaz a conversão do recuperador). Mesmo corpo da 003 + cupom.
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
  if v_ped.cupom_id is not null then
    update cupons set usos = greatest(usos - 1, 0) where id = v_ped.cupom_id;
    update recuperador_envios set convertido_pedido_id = null where convertido_pedido_id = p_id;
  end if;

  update pedidos set status = 'cancelado' where id = p_id;
end;
$$;

-- Confirmação do pedido: + desconto e código do cupom.
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
                                        'quantidade', i.quantidade, 'observacao', i.observacao))
      from pedido_itens i where i.pedido_id = p.id
    ), '[]'::json)
  )
  from pedidos p join empresas e on e.id = p.empresa_id
  where p.id = p_id and e.slug = p_slug and p.tipo <> 'mesa';
$$;

-- ---------- RECUPERADOR ----------
create table recuperador_config (
  empresa_id        uuid primary key references empresas(id) on delete cascade,
  ativo             boolean not null default false,
  dias_sem_comprar  integer not null default 10 check (dias_sem_comprar between 1 and 365),
  tipo_oferta       text not null default 'percentual' check (tipo_oferta in ('percentual', 'valor', 'frete_gratis')),
  valor_oferta      numeric(10,2) not null default 15 check (valor_oferta >= 0),
  pedido_minimo     numeric(10,2) not null default 0 check (pedido_minimo >= 0),
  validade_dias     integer not null default 5 check (validade_dias between 1 and 90),
  intervalo_dias    integer not null default 30 check (intervalo_dias between 1 and 365),
  limite_dia        integer not null default 20 check (limite_dia between 1 and 200),
  janela_inicio     time not null default '10:00',
  janela_fim        time not null default '20:00',
  mensagem          text,                       -- null = texto padrão (lib/recuperador.ts)
  check (tipo_oferta <> 'percentual' or valor_oferta <= 100),
  check (janela_inicio < janela_fim)
);

create table recuperador_envios (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references empresas(id) on delete cascade,
  cliente_id            uuid not null references clientes(id) on delete cascade,
  cupom_id              uuid references cupons(id) on delete set null,
  enviado_em            timestamptz not null default now(),
  status                text not null default 'pendente' check (status in ('pendente', 'enviado', 'falhou')),
  erro                  text,
  convertido_pedido_id  uuid references pedidos(id) on delete set null
);
create index recuperador_envios_empresa on recuperador_envios (empresa_id, enviado_em desc);
create index recuperador_envios_cupom on recuperador_envios (cupom_id);

alter table recuperador_config enable row level security;
alter table recuperador_envios enable row level security;
create policy "dono gerencia recuperador" on recuperador_config for all using (e_membro(empresa_id, '{dono}'))
  with check (e_membro(empresa_id, '{dono}'));
create policy "dono le envios" on recuperador_envios for select using (e_membro(empresa_id, '{dono}'));

-- Empresas que podem receber envio agora: recuperador ligado, liberada e WhatsApp conectado (só service role).
create or replace function public.recuperador_empresas()
returns table (empresa_id uuid, instancia text, slug text, nome text, enviados_hoje bigint)
language sql stable security definer set search_path = public
as $$
  select e.id, w.instancia, e.slug, e.nome,
         (select count(*) from recuperador_envios r
          where r.empresa_id = e.id
            and r.status <> 'falhou'
            and r.enviado_em >= (date_trunc('day', now() at time zone 'America/Cuiaba') at time zone 'America/Cuiaba'))
  from recuperador_config c
  join empresas e on e.id = c.empresa_id
  join whatsapp_conexoes w on w.empresa_id = e.id and w.status = 'conectado'
  where c.ativo and e.ativo and empresa_liberada(e.id);
$$;
revoke all on function public.recuperador_empresas() from public, anon, authenticated;
grant execute on function public.recuperador_empresas() to service_role;

-- Clientes elegíveis (só service role). A reserva confere tudo de novo com trava.
create or replace function public.recuperador_elegiveis(p_empresa uuid, p_limite integer)
returns table (cliente_id uuid)
language sql stable security definer set search_path = public
as $$
  select c.id
  from clientes c join recuperador_config cfg on cfg.empresa_id = c.empresa_id
  where c.empresa_id = p_empresa and c.total_pedidos >= 1 and not c.optout_ofertas
    and c.ultimo_pedido < now() - make_interval(days => cfg.dias_sem_comprar)
    and (c.ultimo_recuperador_em is null or c.ultimo_recuperador_em < now() - make_interval(days => cfg.intervalo_dias))
  order by c.ultimo_pedido desc
  limit p_limite;
$$;
revoke all on function public.recuperador_elegiveis(uuid, integer) from public, anon, authenticated;
grant execute on function public.recuperador_elegiveis(uuid, integer) to service_role;

-- Reserva um envio: confere elegibilidade com trava, gera cupom exclusivo de uso único e registra o envio.
-- Idempotente entre execuções simultâneas: o segundo a chegar vê ultimo_recuperador_em recente e desiste (null).
create or replace function public.recuperador_reservar(p_empresa uuid, p_cliente uuid)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg      recuperador_config%rowtype;
  v_cli      clientes%rowtype;
  v_codigo   text;
  v_cupom    uuid;
  v_envio    uuid;
  v_validade timestamptz;
  v_enviados bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_empresa::text, 0));
  select * into v_cfg from recuperador_config where empresa_id = p_empresa and ativo;
  if not found then return null; end if;
  if not exists (
    select 1 from empresas e
    join whatsapp_conexoes w on w.empresa_id = e.id and w.status = 'conectado'
    where e.id = p_empresa and e.ativo and empresa_liberada(e.id)
  ) then return null; end if;
  if (now() at time zone 'America/Cuiaba')::time < v_cfg.janela_inicio
     or (now() at time zone 'America/Cuiaba')::time >= v_cfg.janela_fim then
    return null;
  end if;
  select count(*) into v_enviados from recuperador_envios
  where empresa_id = p_empresa and status <> 'falhou'
    and enviado_em >= (date_trunc('day', now() at time zone 'America/Cuiaba') at time zone 'America/Cuiaba');
  if v_enviados >= v_cfg.limite_dia then return null; end if;
  select * into v_cli from clientes where id = p_cliente and empresa_id = p_empresa for update;
  if not found or v_cli.optout_ofertas or v_cli.total_pedidos < 1
     or v_cli.ultimo_pedido >= now() - make_interval(days => v_cfg.dias_sem_comprar)
     or (v_cli.ultimo_recuperador_em is not null and v_cli.ultimo_recuperador_em >= now() - make_interval(days => v_cfg.intervalo_dias))
  then
    return null;
  end if;

  v_validade := now() + make_interval(days => v_cfg.validade_dias);
  loop
    v_codigo := 'VOLTA' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    begin
      insert into cupons (empresa_id, codigo, tipo, valor, pedido_minimo, validade, usos_max, cliente_id, origem)
      values (p_empresa, v_codigo, v_cfg.tipo_oferta, v_cfg.valor_oferta, v_cfg.pedido_minimo, v_validade, 1, p_cliente, 'recuperador')
      returning id into v_cupom;
      exit;
    exception when unique_violation then
      -- código já existe: sorteia outro
    end;
  end loop;

  insert into recuperador_envios (empresa_id, cliente_id, cupom_id) values (p_empresa, p_cliente, v_cupom)
  returning id into v_envio;
  update clientes set ultimo_recuperador_em = now() where id = p_cliente;

  return json_build_object('envio_id', v_envio, 'codigo', v_codigo, 'validade', v_validade,
                           'telefone', v_cli.telefone, 'nome', v_cli.nome);
end;
$$;
revoke all on function public.recuperador_reservar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recuperador_reservar(uuid, uuid) to service_role;

-- Métricas do recuperador (dono): conversão = pedido não cancelado com o cupom enviado.
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
      select p.total from envios e join pedidos p on p.id = e.convertido_pedido_id where p.status <> 'cancelado'
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

-- ---------- RELATÓRIO: + total de descontos ----------
-- Mesmo corpo da 009 + 'descontos' e 'pedidos_com_cupom'.
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

-- ---------- AGENDAMENTO (rodar à parte, trocando DOMINIO e SEGREDO) ----------
-- Precisa das extensões pg_cron e pg_net (Database > Extensions). A cada 10 min:
--   select cron.schedule('recuperador', '*/10 * * * *', $cron$
--     select net.http_post(
--       url := 'https://DOMINIO/api/recuperador/processar?secret=SEGREDO',
--       headers := '{"Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb,
--       timeout_milliseconds := 120000
--     );
--   $cron$);
