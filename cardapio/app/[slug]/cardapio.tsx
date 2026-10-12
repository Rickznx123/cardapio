"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, MapPin, ShoppingBag, Store } from "lucide-react";
import { useArmazenado } from "@/lib/armazenado";
import { varsCor } from "@/lib/cor";
import { adicionarCom, type LinhaCarrinho } from "@/lib/linhas";
import { type BairroPublico, brl, type CategoriaPublica, type EmpresaPublica, type ItemPublico } from "@/lib/tipos";
import { Checkout } from "./checkout";
import { ItemSheet } from "./item-sheet";

type Props = { empresa: EmpresaPublica; categorias: CategoriaPublica[]; itens: ItemPublico[]; bairros: BairroPublico[] };

export function Cardapio({ empresa, categorias, itens, bairros }: Props) {
  const [salvo, setLinhas] = useArmazenado<LinhaCarrinho[]>(`carrinho:${empresa.slug}`, []);
  const [aberto, setAberto] = useState(false);
  const [itemAberto, setItemAberto] = useState<ItemPublico | null>(null);
  const podePedir = empresa.aberto && (empresa.aceita_entrega || empresa.aceita_retirada);

  // Ignora formato antigo e itens que saíram do cardápio ou esgotaram desde que foram pro carrinho.
  const porId = new Map(itens.filter((i) => i.disponivel).map((i) => [i.id, i]));
  const linhas = (Array.isArray(salvo) ? salvo : []).filter((l) => porId.has(l.item_id));
  const qtdItem = (id: string) => linhas.reduce((s, l) => s + (l.item_id === id ? l.quantidade : 0), 0);
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const subtotal = linhas.reduce((s, l) => s + porId.get(l.item_id)!.preco * l.quantidade, 0);

  const comItens = categorias.filter((c) => itens.some((i) => i.categoria_id === c.id));
  const taxaMin = bairros.length ? Math.min(...bairros.map((b) => b.taxa)) : null;

  return (
    <div style={varsCor(empresa.cor_primaria)} className="min-h-dvh flex-1 bg-neutral-50 text-neutral-900">
      {aberto && qtd > 0 ? (
        <Checkout empresa={empresa} bairros={bairros} linhas={linhas} porId={porId} subtotal={subtotal}
          setLinhas={setLinhas} fechar={() => setAberto(false)} />
      ) : (
        <main className="mx-auto w-full max-w-2xl bg-white pb-28 sm:my-4 sm:rounded-3xl sm:shadow-sm">
          <Cabecalho empresa={empresa} taxaMin={taxaMin} />
          <Categorias categorias={comItens} />

          {comItens.map((c) => (
            <section key={c.id} id={`c-${c.id}`} data-categoria={c.id} className="scroll-mt-16 px-4 pt-6">
              <h2 className="mb-3 text-lg font-bold">{c.nome}</h2>
              <ul className="space-y-3">
                {itens.filter((i) => i.categoria_id === c.id).map((i) => (
                  <li key={i.id}><CardItem item={i} qtd={qtdItem(i.id)} abrir={() => setItemAberto(i)} /></li>
                ))}
              </ul>
            </section>
          ))}
          {!comItens.length && <p className="p-8 text-center text-neutral-500">Cardápio em preparação. Volte em breve!</p>}
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
    </div>
  );
}

function Cabecalho({ empresa, taxaMin }: { empresa: EmpresaPublica; taxaMin: number | null }) {
  return (
    <header>
      <div className="h-28 sm:rounded-t-3xl"
        style={{ background: "linear-gradient(135deg, var(--cor), color-mix(in srgb, var(--cor) 55%, black))" }} />
      <div className="px-4 pb-4">
        <div className="-mt-10 mb-3 flex size-20 items-center justify-center overflow-hidden rounded-full bg-white text-3xl font-bold text-(--cor) shadow-md ring-4 ring-white">
          {empresa.logo_url ? <img src={empresa.logo_url} alt="" className="size-full object-cover" /> : empresa.nome[0]}
        </div>
        <h1 className="text-2xl font-bold">{empresa.nome}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 font-semibold ${empresa.aberto ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-700"}`}>
            {empresa.aberto ? "Aberto" : "Fechado"}
          </span>
          {empresa.aceita_entrega && taxaMin !== null && (
            <span className="flex items-center gap-1 text-neutral-600">
              <Bike className="size-4" /> {taxaMin === 0 ? "Entrega grátis" : `Entrega a partir de ${brl(taxaMin)}`}
            </span>
          )}
          {empresa.aceita_retirada && (
            <span className="flex items-center gap-1 text-neutral-600"><Store className="size-4" /> Retirada</span>
          )}
        </div>
        {empresa.endereco && (
          <p className="mt-2 flex items-start gap-1 text-sm text-neutral-500">
            <MapPin className="mt-0.5 size-4 shrink-0" /> {empresa.endereco}
          </p>
        )}
        {!empresa.aberto && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Estamos fechados no momento. Você pode ver o cardápio, mas não fazer pedidos.
          </p>
        )}
      </div>
    </header>
  );
}

// Barra fixa de categorias; a ativa acompanha a rolagem (IntersectionObserver).
function Categorias({ categorias }: { categorias: CategoriaPublica[] }) {
  const [ativa, setAtiva] = useState<string | undefined>(categorias[0]?.id);
  const nav = useRef<HTMLElement>(null);

  const travadoAte = useRef(0);

  useEffect(() => {
    let quadro = 0;
    const calcular = () => {
      quadro = 0;
      if (Date.now() < travadoAte.current) return; // rolagem suave vinda de um clique no chip
      const secoes = [...document.querySelectorAll<HTMLElement>("[data-categoria]")];
      // No fim da página as últimas categorias nunca chegam ao topo: ativa a última.
      const noFim = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
      const atual = noFim ? secoes.at(-1) : (secoes.filter((s) => s.getBoundingClientRect().top <= 90).at(-1) ?? secoes[0]);
      setAtiva(atual?.dataset.categoria);
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

  if (categorias.length < 2) return null;
  return (
    <nav ref={nav} aria-label="Categorias"
      className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur [scrollbar-width:none]">
      {categorias.map((c) => (
        <a key={c.id} href={`#c-${c.id}`} data-chip={c.id} aria-current={c.id === ativa ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            setAtiva(c.id);
            travadoAte.current = Date.now() + 900;
            document.getElementById(`c-${c.id}`)?.scrollIntoView({ behavior: "smooth" });
          }}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            c.id === ativa ? "bg-(--cor) text-(--cor-texto)" : "bg-neutral-100 text-neutral-700"}`}>
          {c.nome}
        </a>
      ))}
    </nav>
  );
}

function CardItem({ item, qtd, abrir }: { item: ItemPublico; qtd: number; abrir: () => void }) {
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{item.nome}</p>
        {item.descricao && <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">{item.descricao}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className="font-bold">{brl(item.preco)}</span>
          {!item.disponivel && <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-600">Esgotado</span>}
          {qtd > 0 && <span className="rounded-full bg-(--cor) px-2 py-0.5 text-xs font-semibold text-(--cor-texto)">{qtd} no carrinho</span>}
        </div>
      </div>
      {item.foto_url && (
        <img src={item.foto_url} alt="" loading="lazy" className="size-24 shrink-0 rounded-xl object-cover" />
      )}
    </>
  );
  const base = `flex w-full gap-3 rounded-2xl border border-neutral-200 text-left ${item.foto_url ? "p-3" : "px-4 py-3"}`;
  return item.disponivel ? (
    <button onClick={abrir} className={`${base} transition active:scale-[0.99] hover:border-neutral-300 hover:shadow-sm`}>{conteudo}</button>
  ) : (
    <div className={`${base} opacity-60 grayscale`} aria-disabled="true">{conteudo}</div>
  );
}
