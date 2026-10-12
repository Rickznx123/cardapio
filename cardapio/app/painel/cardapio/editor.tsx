"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Camera, ExternalLink, List, Plus, Search, Star, X } from "lucide-react";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { enviarFoto } from "@/lib/foto";
import { createClient } from "@/lib/supabase/client";
import type { Empresa } from "../configuracoes";
import { CategoriaCard } from "./categoria";
import { DrawerItem } from "./item";
import { acessibilidadeDnd, type Categoria, COLUNAS_ITEM, type ItemEd, MAX_DESTAQUES, type Ops } from "./tipos";

const supabase = createClient();
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const novoId = () => `tmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

// Salva no banco; se falhar, desfaz a mudança otimista e avisa.
async function persistir(req: PromiseLike<{ error: { message: string } | null }>, desfazer: () => void, ok = "Salvo") {
  const { error } = await req;
  if (error) {
    desfazer();
    toast.erro(error.message);
    return false;
  }
  toast.salvo(ok);
  return true;
}

export function EditorCardapio({ empresa, mudou }: { empresa: Empresa; mudou: (e: Empresa) => void }) {
  const [cats, setCats] = useState<Categoria[] | null>(null);
  const [itens, setItens] = useState<ItemEd[]>([]);
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [movendo, setMovendo] = useState<ItemEd | null>(null);
  const [menuCats, setMenuCats] = useState(false);
  const [focar, setFocar] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState<string | null>(null);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    Promise.all([
      supabase.from("categorias").select("id, nome, ordem, ativo").eq("empresa_id", empresa.id).order("ordem"),
      supabase.from("itens").select(COLUNAS_ITEM).eq("empresa_id", empresa.id).order("ordem"),
    ]).then(([c, i]) => {
      if (c.error || i.error) return toast.erro((c.error ?? i.error)!.message);
      setCats(c.data);
      setItens(i.data as ItemEd[]);
    });
  }, [empresa.id]);

  // ---------- empresa (topo) ----------
  async function atualizarEmpresa(campos: Partial<Empresa>) {
    const antes = empresa;
    mudou({ ...empresa, ...campos });
    await persistir(supabase.from("empresas").update(campos).eq("id", empresa.id), () => mudou(antes));
  }
  async function trocarImagemEmpresa(campo: "capa_url" | "logo_url", arquivo: File) {
    setEnviandoFoto(campo);
    try {
      await atualizarEmpresa({ [campo]: await enviarFoto(supabase, empresa.id, arquivo) });
    } catch (e) {
      toast.erro((e as Error).message);
    } finally {
      setEnviandoFoto(null);
    }
  }

  // ---------- itens ----------
  async function efetivarRascunho(r: ItemEd) {
    const ordem = itens.filter((i) => i.categoria_id === r.categoria_id && !i.rascunho).length;
    const { data, error } = await supabase.from("itens")
      .insert({ empresa_id: empresa.id, categoria_id: r.categoria_id, nome: r.nome.trim(), preco: r.preco, ordem })
      .select(COLUNAS_ITEM).single();
    if (error) return toast.erro(error.message);
    setItens((l) => l.map((i) => (i.id === r.id ? { ...(data as ItemEd), k: r.id } : i)));
    toast.salvo("Produto criado");
  }

  function atualizarItem(id: string, campos: Partial<ItemEd>) {
    const antes = itens.find((i) => i.id === id);
    if (!antes) return;
    const depois = { ...antes, ...campos };
    setItens((l) => l.map((i) => (i.id === id ? { ...i, ...campos } : i)));
    if (antes.rascunho) {
      // Rascunho só vai pro banco quando tiver nome e preço.
      if (depois.nome.trim() && depois.preco > 0) efetivarRascunho(depois);
      return;
    }
    const antigos = Object.fromEntries(Object.keys(campos).map((k) => [k, antes[k as keyof ItemEd]]));
    persistir(supabase.from("itens").update(campos).eq("id", id),
      () => setItens((l) => l.map((i) => (i.id === id ? { ...i, ...antigos } : i))));
  }

  function reordenarItens(categoriaId: string, idsEmOrdem: string[]) {
    const antes = itens;
    const novaOrdem = new Map(idsEmOrdem.map((id, n) => [id, n]));
    const mudados = itens.filter((i) => i.categoria_id === categoriaId && novaOrdem.has(i.id) && i.ordem !== novaOrdem.get(i.id));
    setItens((l) => l.map((i) => (novaOrdem.has(i.id) ? { ...i, ordem: novaOrdem.get(i.id)! } : i)));
    persistir(
      Promise.all(mudados.map((i) => supabase.from("itens").update({ ordem: novaOrdem.get(i.id) }).eq("id", i.id)))
        .then((rs) => ({ error: rs.find((r) => r.error)?.error ?? null })),
      () => setItens(antes), "Ordem salva",
    );
  }

  function novoProduto(categoriaId: string) {
    setFechadas((s) => { const n = new Set(s); n.delete(categoriaId); return n; });
    const id = novoId();
    setItens((l) => [...l, {
      id, k: id, categoria_id: categoriaId, nome: "", descricao: null, preco: 0, foto_url: null,
      disponivel: true, destaque: false, ordem: 9999, rascunho: true,
    }]);
  }

  async function duplicar(item: ItemEd) {
    const ordem = Math.max(0, ...itens.filter((i) => i.categoria_id === item.categoria_id).map((i) => i.ordem)) + 1;
    const { data, error } = await supabase.from("itens").insert({
      empresa_id: empresa.id, categoria_id: item.categoria_id, nome: `${item.nome} (cópia)`, descricao: item.descricao,
      preco: item.preco, foto_url: item.foto_url, disponivel: item.disponivel, ordem,
    }).select(COLUNAS_ITEM).single();
    if (error) return toast.erro(error.message);
    setItens((l) => [...l, data as ItemEd]);
    toast.salvo("Produto duplicado");
  }

  async function excluirItem(item: ItemEd) {
    if (!confirm(`Excluir "${item.nome}"?`)) return;
    const antes = itens;
    setItens((l) => l.filter((i) => i.id !== item.id));
    if (editando === item.id) setEditando(null);
    await persistir(supabase.from("itens").delete().eq("id", item.id), () => setItens(antes), "Produto excluído");
  }

  async function trocarFoto(item: ItemEd, arquivo: File) {
    setEnviandoFoto(item.id);
    try {
      atualizarItem(item.id, { foto_url: await enviarFoto(supabase, empresa.id, arquivo) });
    } catch (e) {
      toast.erro((e as Error).message);
    } finally {
      setEnviandoFoto(null);
    }
  }

  function alternarDestaque(item: ItemEd) {
    if (!item.destaque && itens.filter((i) => i.destaque).length >= MAX_DESTAQUES) {
      return toast.erro(`Máximo de ${MAX_DESTAQUES} destaques. Tire a estrela de outro produto antes.`);
    }
    atualizarItem(item.id, { destaque: !item.destaque });
  }

  // ---------- categorias ----------
  function atualizarCategoria(id: string, campos: Partial<Categoria>) {
    const antes = cats?.find((c) => c.id === id);
    if (!antes) return;
    const antigos = Object.fromEntries(Object.keys(campos).map((k) => [k, antes[k as keyof Categoria]]));
    setCats((l) => l!.map((c) => (c.id === id ? { ...c, ...campos } : c)));
    persistir(supabase.from("categorias").update(campos).eq("id", id),
      () => setCats((l) => l!.map((c) => (c.id === id ? { ...c, ...antigos } : c))));
  }

  async function novaCategoria() {
    const { data, error } = await supabase.from("categorias")
      .insert({ empresa_id: empresa.id, nome: "Nova categoria", ordem: cats?.length ?? 0 })
      .select("id, nome, ordem, ativo").single();
    if (error) return toast.erro(error.message);
    setCats((l) => [...(l ?? []), data]);
    setFocar(data.id);
  }

  async function excluirCategoria(c: Categoria) {
    const n = itens.filter((i) => i.categoria_id === c.id && !i.rascunho).length;
    if (!confirm(n ? `Excluir "${c.nome}" e os ${n} produto(s) dela?` : `Excluir "${c.nome}"?`)) return;
    const antes = { cats, itens };
    setCats((l) => l!.filter((x) => x.id !== c.id));
    setItens((l) => l.filter((i) => i.categoria_id !== c.id));
    await persistir(supabase.from("categorias").delete().eq("id", c.id),
      () => { setCats(antes.cats); setItens(antes.itens); }, "Categoria excluída");
  }

  function aoSoltarCategoria({ active, over }: DragEndEvent) {
    if (!cats || !over || active.id === over.id) return;
    const antes = cats;
    const nova = arrayMove(cats, cats.findIndex((c) => c.id === active.id), cats.findIndex((c) => c.id === over.id))
      .map((c, n) => ({ ...c, ordem: n }));
    const mudadas = nova.filter((c) => antes.find((x) => x.id === c.id)!.ordem !== c.ordem);
    setCats(nova);
    persistir(
      Promise.all(mudadas.map((c) => supabase.from("categorias").update({ ordem: c.ordem }).eq("id", c.id)))
        .then((rs) => ({ error: rs.find((r) => r.error)?.error ?? null })),
      () => setCats(antes), "Ordem salva",
    );
  }

  const ops: Ops = {
    atualizarItem, atualizarCategoria, reordenarItens, novoProduto, duplicar, excluirItem, excluirCategoria,
    trocarFoto, alternarDestaque, editar: setEditando, mover: setMovendo,
    descartarRascunho: (id) => setItens((l) => l.filter((i) => i.id !== id)),
  };

  if (!cats) return <div className="h-64 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" aria-label="Carregando cardápio" />;

  const termo = normalizar(busca?.trim() ?? "");
  const itensDa = (catId: string) => itens
    .filter((i) => i.categoria_id === catId && (!termo || i.rascunho || normalizar(i.nome).includes(termo)))
    .sort((a, b) => a.ordem - b.ordem);
  const visiveis = termo ? cats.filter((c) => itensDa(c.id).length) : cats;
  const destaques = itens.filter((i) => i.destaque);
  const irPara = (id: string) => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const emEdicao = itens.find((i) => i.id === editando);

  return (
    <div className="space-y-4">
      {/* ---------- topo: capa, logo, nome ---------- */}
      <section>
        <div className="relative aspect-[3/1] overflow-hidden rounded-2xl bg-gradient-to-br from-rose-600 to-rose-900 sm:aspect-[4/1]">
          {empresa.capa_url && <img src={empresa.capa_url} alt="" className="size-full object-cover" />}
          <BotaoCamera rotulo="Trocar capa" ocupado={enviandoFoto === "capa_url"} className="right-3 bottom-3"
            escolher={(f) => trocarImagemEmpresa("capa_url", f)} />
        </div>
        <div className="flex flex-wrap items-end gap-3 px-3">
          <div className="relative z-[1] -mt-10 size-20 shrink-0 overflow-hidden rounded-2xl bg-white shadow-md ring-4 ring-neutral-50 dark:bg-neutral-800 dark:ring-neutral-950">
            {empresa.logo_url
              ? <img src={empresa.logo_url} alt="" className="size-full object-cover" />
              : <span className="flex size-full items-center justify-center text-3xl font-bold text-rose-600">{empresa.nome[0]}</span>}
            <BotaoCamera rotulo="Trocar logo" ocupado={enviandoFoto === "logo_url"} className="right-1 bottom-1 size-8"
              escolher={(f) => trocarImagemEmpresa("logo_url", f)} />
          </div>
          <label className="min-w-0 flex-1 basis-48 pt-2">
            <span className="sr-only">Nome da empresa</span>
            <input key={empresa.nome} defaultValue={empresa.nome} maxLength={80}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) { e.target.value = empresa.nome; return toast.erro("O nome não pode ficar vazio"); }
                if (v !== empresa.nome) atualizarEmpresa({ nome: v });
              }}
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-bold hover:border-neutral-300 focus:border-rose-500 focus:outline-none dark:hover:border-neutral-700" />
          </label>
          <div className="flex gap-2 pb-1">
            <button onClick={() => setBusca(busca === null ? "" : null)} aria-pressed={busca !== null} aria-label="Buscar produto"
              className="flex h-10 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-sm font-medium hover:bg-white dark:border-neutral-700 dark:hover:bg-neutral-800">
              <Search className="size-4" /><span className="hidden sm:inline">Buscar</span>
            </button>
            <Link href={`/${empresa.slug}`} target="_blank"
              className="flex h-10 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-sm font-medium hover:bg-white dark:border-neutral-700 dark:hover:bg-neutral-800">
              <ExternalLink className="size-4" /> Ver cardápio
            </Link>
          </div>
        </div>
        {busca !== null && (
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
            <input autoFocus type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto pelo nome"
              aria-label="Buscar produto"
              className="h-11 w-full rounded-lg border border-neutral-300 bg-white pr-10 pl-9 text-base dark:border-neutral-700 dark:bg-neutral-900" />
            <button onClick={() => setBusca(null)} aria-label="Fechar busca" className="absolute top-1/2 right-2 -translate-y-1/2 p-1">
              <X className="size-4" />
            </button>
          </label>
        )}
      </section>

      {/* ---------- barra de categorias ---------- */}
      {cats.length > 0 && (
        <div className="sticky top-14 z-10 -mx-4 flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/95 px-4 py-2 backdrop-blur md:-mx-8 md:px-8 lg:top-0 dark:border-neutral-800 dark:bg-neutral-950/95">
          <button onClick={() => setMenuCats(true)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-3 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
            <List className="size-4" /> Categorias
          </button>
          <nav className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Pular para categoria">
            {visiveis.map((c) => (
              <button key={c.id} onClick={() => irPara(c.id)}
                className={`h-9 shrink-0 rounded-full border px-3 text-sm ${c.ativo ? "border-neutral-300 dark:border-neutral-700" : "border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-700"}`}>
                {c.nome}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* ---------- destaques ---------- */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40" aria-label="Destaques">
        <h2 className="flex items-center gap-2 font-semibold">
          <Star className="size-5 fill-amber-400 text-amber-500" /> Destaques
          <span className="ml-auto rounded-full bg-white px-2 text-sm font-bold tabular-nums dark:bg-neutral-900">{destaques.length}/{MAX_DESTAQUES}</span>
        </h2>
        {destaques.length === 0 ? (
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Toque na estrela de um produto para ele aparecer no topo do cardápio.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {destaques.map((i) => (
              <li key={i.id} className="flex items-center gap-1.5 rounded-full bg-white py-1 pr-1 pl-1 text-sm shadow-sm dark:bg-neutral-900">
                {i.foto_url ? <img src={i.foto_url} alt="" className="size-6 rounded-full object-cover" /> : <span className="size-6 rounded-full bg-neutral-200 dark:bg-neutral-700" />}
                <button onClick={() => setEditando(i.id)} className="max-w-40 truncate hover:underline">{i.nome}</button>
                <button onClick={() => alternarDestaque(i)} aria-label={`Tirar ${i.nome} dos destaques`}
                  className="flex size-6 items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- categorias ---------- */}
      {termo && !visiveis.length && <p className="p-6 text-center text-neutral-500">Nenhum produto com &quot;{busca}&quot;.</p>}
      <DndContext id="dnd-categorias" sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltarCategoria} accessibility={acessibilidadeDnd}>
        <SortableContext items={visiveis.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-3">
            {visiveis.map((c) => (
              <CategoriaCard key={c.id} categoria={c} itens={itensDa(c.id)} ops={ops} focar={focar === c.id}
                aberta={!!termo || !fechadas.has(c.id)} arrastavel={!termo} enviandoFoto={enviandoFoto}
                alternar={() => setFechadas((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {!termo && (
        <button onClick={novaCategoria}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 font-semibold text-neutral-600 hover:border-rose-400 hover:text-rose-600 dark:border-neutral-700 dark:text-neutral-300">
          <Plus className="size-5" /> Nova categoria
        </button>
      )}

      {menuCats && (
        <Modal titulo="Categorias" fechar={() => setMenuCats(false)}>
          <ul className="p-2">
            {cats.map((c) => (
              <li key={c.id}>
                <button onClick={() => { setMenuCats(false); setTimeout(() => irPara(c.id), 50); }}
                  className="flex h-12 w-full items-center justify-between rounded-xl px-4 text-left font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <span className={c.ativo ? "" : "text-neutral-400"}>{c.nome}</span>
                  <span className="text-sm text-neutral-500">{itens.filter((i) => i.categoria_id === c.id && !i.rascunho).length}</span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {movendo && (
        <Modal titulo={`Mover "${movendo.nome}"`} fechar={() => setMovendo(null)}>
          <ul className="p-2">
            {cats.filter((c) => c.id !== movendo.categoria_id).map((c) => (
              <li key={c.id}>
                <button onClick={() => {
                  atualizarItem(movendo.id, { categoria_id: c.id, ordem: itens.filter((i) => i.categoria_id === c.id).length });
                  setMovendo(null);
                }} className="flex h-12 w-full items-center rounded-xl px-4 text-left font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  {c.nome}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {emEdicao && !emEdicao.rascunho && (
        <DrawerItem key={emEdicao.id} item={emEdicao} categorias={cats} ops={ops} enviandoFoto={enviandoFoto === emEdicao.id}
          fechar={() => setEditando(null)} />
      )}
    </div>
  );
}

function BotaoCamera({ rotulo, ocupado, className, escolher }: {
  rotulo: string; ocupado: boolean; className: string; escolher: (f: File) => void;
}) {
  return (
    <label title={rotulo}
      className={`absolute flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/75 ${ocupado ? "animate-pulse" : ""} ${className}`}>
      <Camera className="size-4" />
      <input type="file" accept="image/*" className="sr-only" disabled={ocupado} aria-label={rotulo}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) escolher(f); e.target.value = ""; }} />
    </label>
  );
}
