"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bike, Clock, CreditCard, Info, List, MapPin, MessageCircle, RotateCcw, Search, ShoppingBag, Star, Store, Timer, X,
} from "lucide-react";
import { RodapeLegal } from "@/components/links-legais";
import { Modal } from "@/components/modal";
import { useArmazenado } from "@/lib/armazenado";
import { varsCor } from "@/lib/cor";
import { temHorarios, textoDia } from "@/lib/horarios";
import { adicionarCom, type LinhaCarrinho } from "@/lib/linhas";
import {
  type BairroPublico, brl, type CategoriaPublica, DIAS, type EmpresaPublica, FORMAS, type ItemPublico, textoTempo,
} from "@/lib/tipos";
import { Checkout } from "./checkout";
import { ItemSheet } from "./item-sheet";

type Props = { empresa: EmpresaPublica; categorias: CategoriaPublica[]; itens: ItemPublico[]; bairros: BairroPublico[] };
export type UltimoPedido = { em: string; linhas: LinhaCarrinho[] };

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const irPara = (id: string) => document.getElementById(`c-${id}`)?.scrollIntoView({ behavior: "smooth" });

export function Cardapio({ empresa, categorias, itens, bairros }: Props) {
  const [salvo, setLinhas] = useArmazenado<LinhaCarrinho[]>(`carrinho:${empresa.slug}`, []);
  const [ultimo] = useArmazenado<UltimoPedido | null>(`ultimo:${empresa.slug}`, null);
  const [aberto, setAberto] = useState(false);
  const [itemAberto, setItemAberto] = useState<ItemPublico | null>(null);
  const [info, setInfo] = useState(false);
  const [busca, setBusca] = useState<string | null>(null);
  const podePedir = empresa.aberto && (empresa.aceita_entrega || empresa.aceita_retirada);

  // Ignora formato antigo e itens que saíram do cardápio ou esgotaram desde que foram pro carrinho.
  const porId = new Map(itens.filter((i) => i.disponivel).map((i) => [i.id, i]));
  const linhas = (Array.isArray(salvo) ? salvo : []).filter((l) => porId.has(l.item_id));
  const qtdItem = (id: string) => linhas.reduce((s, l) => s + (l.item_id === id ? l.quantidade : 0), 0);
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const subtotal = linhas.reduce((s, l) => s + porId.get(l.item_id)!.preco * l.quantidade, 0);

  const comItens = categorias.filter((c) => itens.some((i) => i.categoria_id === c.id));
  // Destaques: só disponíveis e de categorias visíveis (categorias ocultas não vêm na lista).
  const visiveisIds = new Set(comItens.map((c) => c.id));
  const destaques = itens.filter((i) => i.destaque && i.disponivel && visiveisIds.has(i.categoria_id));
  const termo = normalizar(busca?.trim() ?? "");
  const encontrados = termo
    ? itens.filter((i) => normalizar(`${i.nome} ${i.descricao ?? ""}`).includes(termo))
    : [];

  function repetir() {
    let novo = linhas;
    for (const l of ultimo?.linhas ?? []) {
      if (porId.has(l.item_id)) novo = adicionarCom(novo, l.item_id, l.quantidade, l.observacao);
    }
    setLinhas(novo);
    if (novo.length) { setAberto(true); scrollTo(0, 0); }
  }

  const card = (i: ItemPublico) => <CardItem key={i.id} item={i} qtd={qtdItem(i.id)} abrir={() => setItemAberto(i)} />;

  return (
    <div style={varsCor(empresa.cor_primaria)} className="min-h-dvh flex-1 bg-neutral-50 text-neutral-900">
      {aberto && qtd > 0 ? (
        <Checkout empresa={empresa} bairros={bairros} linhas={linhas} porId={porId} subtotal={subtotal}
          setLinhas={setLinhas} fechar={() => setAberto(false)} />
      ) : (
        <main className="mx-auto w-full max-w-5xl bg-white pb-28 sm:my-4 sm:rounded-3xl sm:shadow-sm">
          <Cabecalho empresa={empresa} abrirInfo={() => setInfo(true)} />
          <BarraCategorias categorias={comItens} busca={busca} setBusca={setBusca} />

          {busca !== null && termo ? (
            <section className="px-4 pt-6">
              <h2 className="mb-3 text-lg font-bold">{encontrados.length} resultado{encontrados.length === 1 ? "" : "s"}</h2>
              <ul className="grid gap-3 md:grid-cols-2">{encontrados.map((i) => <li key={i.id}>{card(i)}</li>)}</ul>
            </section>
          ) : (
            <>
              {ultimo && ultimo.linhas?.length > 0 && podePedir && (
                <UltimoPedidoCard ultimo={ultimo} porId={porId} repetir={repetir} />
              )}
              {destaques.length > 0 && (
                <section className="pt-6" aria-labelledby="destaques-titulo">
                  <h2 id="destaques-titulo" className="mb-3 flex items-center gap-2 px-4 text-lg font-bold">
                    <Star className="size-5 fill-amber-400 text-amber-500" /> Destaques
                  </h2>
                  <ul className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:grid md:grid-cols-4 md:overflow-visible">
                    {destaques.map((i) => (
                      <li key={i.id} className="w-40 shrink-0 snap-start md:w-auto">
                        <button onClick={() => setItemAberto(i)}
                          className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-neutral-200 text-left transition hover:shadow-sm active:scale-[0.99]">
                          {i.foto_url
                            ? <img src={i.foto_url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                            : <span className="flex aspect-square w-full items-center justify-center bg-(--cor)/10 text-3xl font-bold text-(--cor)">{i.nome[0]}</span>}
                          <span className="flex flex-1 flex-col p-3">
                            <span className="line-clamp-2 text-sm font-semibold">{i.nome}</span>
                            <span className="mt-auto pt-1 font-bold">{brl(i.preco)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {comItens.map((c) => (
                <section key={c.id} id={`c-${c.id}`} data-categoria={c.id} className="scroll-mt-20 px-4 pt-6">
                  <h2 className="mb-3 text-lg font-bold">{c.nome}</h2>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {itens.filter((i) => i.categoria_id === c.id).map((i) => <li key={i.id}>{card(i)}</li>)}
                  </ul>
                </section>
              ))}
              {!comItens.length && <p className="p-8 text-center text-neutral-500">Cardápio em preparação. Volte em breve!</p>}
            </>
          )}
          <RodapeLegal />
        </main>
      )}

      {!aberto && qtd > 0 && podePedir && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <button onClick={() => { setAberto(true); scrollTo(0, 0); }}
            className="animate-surgir mx-auto flex h-14 w-full max-w-2xl items-center gap-3 rounded-2xl bg-(--cor) px-5 font-semibold text-(--cor-texto) shadow-xl">
            <ShoppingBag className="size-5" />
            <span>Ver carrinho</span>
            <span className="opacity-80">· {qtd} {qtd === 1 ? "item" : "itens"}</span>
            <span className="ml-auto">{brl(subtotal)}</span>
          </button>
        </div>
      )}

      {itemAberto && (
        <ItemSheet key={itemAberto.id} item={itemAberto} podePedir={podePedir} fechar={() => setItemAberto(null)}
          adicionar={(q, obs) => setLinhas(adicionarCom(linhas, itemAberto.id, q, obs))} />
      )}
      {info && <InfoModal empresa={empresa} bairros={bairros} fechar={() => setInfo(false)} />}
    </div>
  );
}

function Cabecalho({ empresa, abrirInfo }: { empresa: EmpresaPublica; abrirInfo: () => void }) {
  return (
    <header className="p-3 sm:p-4">
      <div className="relative aspect-[5/2] overflow-hidden rounded-2xl sm:aspect-[4/1]"
        style={empresa.capa_url ? undefined : { background: "linear-gradient(135deg, var(--cor), color-mix(in srgb, var(--cor) 55%, black))" }}>
        {empresa.capa_url && <img src={empresa.capa_url} alt="" className="size-full object-cover" />}
      </div>
      <div className="flex items-end gap-3 px-2">
        <div className="relative z-[1] -mt-10 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-3xl font-bold text-(--cor) shadow-md ring-4 ring-white sm:size-24">
          {empresa.logo_url ? <img src={empresa.logo_url} alt="" className="size-full object-cover" /> : empresa.nome[0]}
        </div>
        <div className="ml-auto flex gap-2 pt-3">
          {empresa.whatsapp && (
            <a href={`https://wa.me/${empresa.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp"
              className="flex h-10 items-center gap-1.5 rounded-full border border-neutral-200 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50">
              <MessageCircle className="size-5" /><span className="hidden sm:inline">WhatsApp</span>
            </a>
          )}
          <button onClick={abrirInfo}
            className="flex h-10 items-center gap-1.5 rounded-full border border-neutral-200 px-3 text-sm font-medium hover:bg-neutral-50">
            <Info className="size-5" /> Informações
          </button>
        </div>
      </div>
      <div className="px-2 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{empresa.nome}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${empresa.aberto ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-700"}`}>
            {empresa.aberto ? "Aberto" : "Fechado"}
          </span>
        </div>
        {empresa.descricao && <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{empresa.descricao}</p>}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
          {empresa.horario_texto && <span className="flex items-center gap-1"><Clock className="size-4" /> {empresa.horario_texto}</span>}
          {empresa.aceita_entrega && (
            <span className="flex items-center gap-1"><Bike className="size-4" /> Entrega
              {textoTempo(empresa.tempo_entrega_min, empresa.tempo_entrega_max) && ` · ${textoTempo(empresa.tempo_entrega_min, empresa.tempo_entrega_max)}`}
            </span>
          )}
          {empresa.aceita_retirada && (
            <span className="flex items-center gap-1"><Store className="size-4" /> Retirada
              {textoTempo(empresa.tempo_retirada) && ` · ${textoTempo(empresa.tempo_retirada)}`}
            </span>
          )}
        </div>
        {!empresa.aberto && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Estamos fechados no momento. Você pode ver o cardápio, mas não fazer pedidos.
          </p>
        )}
      </div>
    </header>
  );
}

function InfoModal({ empresa, bairros, fechar }: { empresa: EmpresaPublica; bairros: BairroPublico[]; fechar: () => void }) {
  const bloco = "space-y-1 border-b border-neutral-200 py-4 last:border-0";
  return (
    <Modal titulo={empresa.nome} fechar={fechar}>
      <div className="px-5">
        {empresa.descricao && <p className="border-b border-neutral-200 py-4 text-neutral-700">{empresa.descricao}</p>}
        {empresa.endereco && (
          <div className={bloco}>
            <h3 className="flex items-center gap-2 font-semibold"><MapPin className="size-4" /> Endereço</h3>
            <p className="text-neutral-700">{empresa.endereco}</p>
          </div>
        )}
        {temHorarios(empresa.horarios) ? (
          <div className={bloco}>
            <h3 className="flex items-center gap-2 font-semibold"><Clock className="size-4" /> Horário</h3>
            <dl className="divide-y divide-neutral-100 text-sm">
              {DIAS.map(([d, nome]) => {
                const h = empresa.horarios?.[d];
                return (
                  <div key={d} className="flex justify-between py-1.5">
                    <dt>{nome}</dt>
                    <dd className={h?.length ? "text-right tabular-nums" : "text-neutral-500"}>{textoDia(h)}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ) : empresa.horario_texto && (
          <div className={bloco}>
            <h3 className="flex items-center gap-2 font-semibold"><Clock className="size-4" /> Horário</h3>
            <p className="whitespace-pre-line text-neutral-700">{empresa.horario_texto}</p>
          </div>
        )}
        {(textoTempo(empresa.tempo_entrega_min, empresa.tempo_entrega_max) || textoTempo(empresa.tempo_retirada)) && (
          <div className={bloco}>
            <h3 className="flex items-center gap-2 font-semibold"><Timer className="size-4" /> Tempo estimado</h3>
            {empresa.aceita_entrega && textoTempo(empresa.tempo_entrega_min, empresa.tempo_entrega_max) && (
              <p className="text-neutral-700">Entrega: {textoTempo(empresa.tempo_entrega_min, empresa.tempo_entrega_max)}</p>
            )}
            {empresa.aceita_retirada && textoTempo(empresa.tempo_retirada) && (
              <p className="text-neutral-700">Retirada: {textoTempo(empresa.tempo_retirada)}</p>
            )}
          </div>
        )}
        <div className={bloco}>
          <h3 className="flex items-center gap-2 font-semibold"><CreditCard className="size-4" /> Formas de pagamento</h3>
          <p className="text-neutral-700">{(empresa.formas_pagamento ?? []).map((f) => FORMAS[f]).join(" · ")}</p>
        </div>
        {empresa.aceita_entrega && bairros.length > 0 && (
          <div className={bloco}>
            <h3 className="flex items-center gap-2 font-semibold"><Bike className="size-4" /> Bairros atendidos</h3>
            <ul className="divide-y divide-neutral-100 text-sm">
              {bairros.map((b) => (
                <li key={b.id} className="flex justify-between gap-2 py-2">
                  <span>{b.nome}</span>
                  <span className="text-right text-neutral-600">
                    {b.taxa === 0 ? "Grátis" : brl(b.taxa)}
                    {b.pedido_minimo > 0 && <span className="block text-xs">mín. {brl(b.pedido_minimo)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Barra fixa: menu de categorias, chips com a ativa destacada ao rolar, e busca.
function BarraCategorias({ categorias, busca, setBusca }: {
  categorias: CategoriaPublica[]; busca: string | null; setBusca: (b: string | null) => void;
}) {
  const [ativa, setAtiva] = useState<string | undefined>(categorias[0]?.id);
  const [menu, setMenu] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const travado = useRef(false);

  useEffect(() => {
    let quadro = 0;
    const calcular = () => {
      quadro = 0;
      if (travado.current) return; // rolagem suave vinda de um clique no chip
      const secoes = [...document.querySelectorAll<HTMLElement>("[data-categoria]")];
      // No fim da página as últimas categorias nunca chegam ao topo: ativa a última.
      const noFim = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      const atual = noFim ? secoes.at(-1) : (secoes.filter((s) => s.getBoundingClientRect().top <= 100).at(-1) ?? secoes[0]);
      if (atual) setAtiva(atual.dataset.categoria);
    };
    const aoRolar = () => { if (!quadro) quadro = requestAnimationFrame(calcular); };
    addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      removeEventListener("scroll", aoRolar);
      cancelAnimationFrame(quadro);
    };
  }, [categorias]);

  useEffect(() => {
    const chip = nav.current?.querySelector<HTMLElement>(`[data-chip="${ativa}"]`);
    if (chip && nav.current) {
      nav.current.scrollTo({ left: chip.offsetLeft - nav.current.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
    }
  }, [ativa]);

  function escolher(id: string) {
    setAtiva(id);
    travado.current = true;
    setTimeout(() => { travado.current = false; }, 900);
    irPara(id);
  }

  const iconeBtn = "flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700";

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-white/95 px-3 py-2.5 backdrop-blur">
      {busca !== null ? (
        <>
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
            <input autoFocus type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no cardápio"
              aria-label="Buscar no cardápio"
              className="h-10 w-full rounded-full bg-neutral-100 pr-3 pl-10 text-base outline-none focus:ring-2 focus:ring-(--cor)/40" />
          </label>
          <button onClick={() => setBusca(null)} aria-label="Fechar busca" className={iconeBtn}><X className="size-5" /></button>
        </>
      ) : (
        <>
          {categorias.length > 1 && (
            <button onClick={() => setMenu(true)} aria-label="Todas as categorias" className={iconeBtn}><List className="size-5" /></button>
          )}
          <nav ref={nav} aria-label="Categorias" className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
            {categorias.map((c) => (
              <a key={c.id} href={`#c-${c.id}`} data-chip={c.id} aria-current={c.id === ativa ? "true" : undefined}
                onClick={(e) => { e.preventDefault(); escolher(c.id); }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  c.id === ativa ? "bg-(--cor) text-(--cor-texto)" : "bg-neutral-100 text-neutral-700"}`}>
                {c.nome}
              </a>
            ))}
          </nav>
          <button onClick={() => setBusca("")} aria-label="Buscar no cardápio" className={iconeBtn}><Search className="size-5" /></button>
        </>
      )}

      {menu && (
        <Modal titulo="Categorias" fechar={() => setMenu(false)}>
          <ul className="p-2">
            {categorias.map((c) => (
              <li key={c.id}>
                <button onClick={() => { setMenu(false); setTimeout(() => escolher(c.id), 50); }}
                  className={`flex h-12 w-full items-center rounded-xl px-4 text-left font-medium hover:bg-neutral-100 ${c.id === ativa ? "text-(--cor)" : ""}`}>
                  {c.nome}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

function UltimoPedidoCard({ ultimo, porId, repetir }: {
  ultimo: UltimoPedido; porId: Map<string, ItemPublico>; repetir: () => void;
}) {
  const disponiveis = ultimo.linhas.filter((l) => porId.has(l.item_id));
  const faltam = ultimo.linhas.length - disponiveis.length;
  return (
    <section className="mx-4 mt-6 rounded-2xl border border-(--cor)/30 bg-(--cor)/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">Seu último pedido</h2>
          <p className="text-xs text-neutral-500">{new Date(ultimo.em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
        </div>
        <button onClick={repetir} disabled={!disponiveis.length}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-(--cor) px-4 text-sm font-semibold text-(--cor-texto) disabled:opacity-50">
          <RotateCcw className="size-4" /> Repetir pedido
        </button>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-neutral-700">
        {disponiveis.map((l) => `${l.quantidade}x ${porId.get(l.item_id)!.nome}`).join(", ")}
      </p>
      {faltam > 0 && <p className="mt-1 text-xs text-neutral-500">{faltam} item(ns) não está(ão) disponível(is) hoje.</p>}
    </section>
  );
}

function CardItem({ item, qtd, abrir }: { item: ItemPublico; qtd: number; abrir: () => void }) {
  const conteudo = (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-semibold">{item.nome}</p>
        {item.descricao && <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{item.descricao}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <span className="font-bold">{brl(item.preco)}</span>
          {!item.disponivel && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-600">Esgotado</span>}
          {qtd > 0 && <span className="rounded-full bg-(--cor) px-2 py-0.5 text-xs font-semibold text-(--cor-texto)">{qtd} no carrinho</span>}
        </div>
      </div>
      {item.foto_url && (
        <img src={item.foto_url} alt="" loading="lazy" className="aspect-square size-24 shrink-0 rounded-xl object-cover sm:size-28" />
      )}
    </>
  );
  const base = `flex h-full w-full gap-3 rounded-2xl border border-neutral-200 text-left ${item.foto_url ? "p-3" : "px-4 py-3"}`;
  return item.disponivel ? (
    <button onClick={abrir} className={`${base} transition hover:border-neutral-300 hover:shadow-sm active:scale-[0.99]`}>{conteudo}</button>
  ) : (
    <div className={`${base} opacity-60 grayscale`} aria-disabled="true">{conteudo}</div>
  );
}
