"use client";

import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowRightLeft, Copy, GripVertical, ImagePlus, Loader2, MoreVertical, Pencil, Star, Trash2, X } from "lucide-react";
import { toast } from "@/components/toast";
import { type Categoria, fecharMenu, type ItemEd, lerPreco, menuCaixa, menuItem, mostrarPreco, type Ops } from "./tipos";

const iconeBtn = "flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800";
const campoInline = "rounded-lg border border-transparent bg-transparent px-2 py-1 hover:border-neutral-300 focus:border-rose-500 focus:outline-none dark:hover:border-neutral-700";
const blurNoEnter = (e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && e.currentTarget.blur();

function salvarNome(item: ItemEd, ops: Ops, el: HTMLInputElement) {
  const v = el.value.trim();
  if (!v) {
    if (item.rascunho) return;
    el.value = item.nome;
    return toast.erro("O nome do produto não pode ficar vazio");
  }
  if (v !== item.nome) ops.atualizarItem(item.id, { nome: v });
}

function salvarPreco(item: ItemEd, ops: Ops, el: HTMLInputElement) {
  if (item.rascunho && !el.value.trim()) return;
  const v = lerPreco(el.value);
  if (Number.isNaN(v) || v < 0 || v > 99999) {
    el.value = item.rascunho ? "" : mostrarPreco(item.preco);
    return toast.erro("Preço inválido");
  }
  el.value = mostrarPreco(v);
  if (v !== item.preco || item.rascunho) ops.atualizarItem(item.id, { preco: v });
}

function CampoPreco({ item, ops, className = "" }: { item: ItemEd; ops: Ops; className?: string }) {
  return (
    <label className={`flex items-center rounded-lg border border-neutral-200 focus-within:border-rose-500 dark:border-neutral-700 ${className}`}>
      <span className="pl-2 text-sm text-neutral-500">R$</span>
      <input key={item.preco} defaultValue={item.rascunho && !item.preco ? "" : mostrarPreco(item.preco)}
        inputMode="decimal" placeholder="0,00" aria-label={`Preço de ${item.nome || "novo produto"}`}
        onBlur={(e) => salvarPreco(item, ops, e.target)} onKeyDown={blurNoEnter}
        className="h-9 w-full min-w-0 bg-transparent px-1.5 text-right font-semibold tabular-nums focus:outline-none" />
    </label>
  );
}

function Disponivel({ item, ops }: { item: ItemEd; ops: Ops }) {
  return (
    <button role="switch" aria-checked={item.disponivel} onClick={() => ops.atualizarItem(item.id, { disponivel: !item.disponivel })}
      aria-label={`${item.nome}: ${item.disponivel ? "disponível" : "esgotado"}`}
      className={`h-7 shrink-0 rounded-full px-2.5 text-xs font-bold ${
        item.disponivel ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"}`}>
      {item.disponivel ? "Disponível" : "Esgotado"}
    </button>
  );
}

function Destaque({ item, ops }: { item: ItemEd; ops: Ops }) {
  return (
    <button onClick={() => ops.alternarDestaque(item)} aria-pressed={item.destaque}
      aria-label={item.destaque ? `Tirar ${item.nome} dos destaques` : `Destacar ${item.nome}`} className={iconeBtn}>
      <Star className={`size-5 ${item.destaque ? "fill-amber-400 text-amber-500" : "text-neutral-400"}`} />
    </button>
  );
}

function EscolherFoto({ item, ops, children, className, rotulo }: {
  item: ItemEd; ops: Ops; children: React.ReactNode; className: string; rotulo: string;
}) {
  return (
    <label className={`cursor-pointer ${className}`} title={rotulo}>
      {children}
      <input type="file" accept="image/*" className="sr-only" aria-label={rotulo}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) ops.trocarFoto(item, f); e.target.value = ""; }} />
    </label>
  );
}

export function LinhaItem({ item: i, ops, arrastavel, enviandoFoto }: {
  item: ItemEd; ops: Ops; arrastavel: boolean; enviandoFoto: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: i.id, disabled: !arrastavel });

  const miniatura = (
    <span className="relative flex size-12 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
      {i.foto_url ? <img src={i.foto_url} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5" />}
      {enviandoFoto && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white"><Loader2 className="size-5 animate-spin" /></span>}
    </span>
  );

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex flex-wrap items-center gap-1.5 px-2 py-2 sm:px-3 ${isDragging ? "relative z-30 bg-white shadow-lg dark:bg-neutral-800" : ""} ${
        i.rascunho ? "bg-rose-50/60 dark:bg-rose-950/30" : ""}`}>
      {arrastavel && (
        <button {...attributes} {...listeners} aria-label={`Arrastar ${i.nome}`}
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing dark:hover:bg-neutral-800">
          <GripVertical className="size-4" />
        </button>
      )}
      {i.rascunho ? miniatura : (
        <EscolherFoto item={i} ops={ops} className="shrink-0 rounded-lg hover:opacity-80" rotulo={`Trocar foto de ${i.nome}`}>{miniatura}</EscolherFoto>
      )}
      <input key={i.nome} defaultValue={i.nome} placeholder="Nome do produto" maxLength={80} autoFocus={i.rascunho && !i.nome}
        aria-label="Nome do produto" onBlur={(e) => salvarNome(i, ops, e.target)} onKeyDown={blurNoEnter}
        className={`${campoInline} min-w-0 flex-1 basis-36 font-medium ${i.disponivel ? "" : "text-neutral-400 line-through"}`} />
      <div className="ml-auto flex items-center gap-1">
        <CampoPreco item={i} ops={ops} className="w-28" />
        {i.rascunho ? (
          <>
            <span className="hidden px-1 text-xs text-rose-700 sm:inline dark:text-rose-300">preencha nome e preço</span>
            <button onClick={() => ops.descartarRascunho(i.id)} aria-label="Descartar produto novo" className={iconeBtn}><X className="size-4" /></button>
          </>
        ) : (
          <>
            <Disponivel item={i} ops={ops} />
            <Destaque item={i} ops={ops} />
            <button onClick={() => ops.editar(i.id)} aria-label={`Editar ${i.nome}`} className={iconeBtn}><Pencil className="size-4" /></button>
            <details className="relative">
              <summary aria-label={`Mais ações de ${i.nome}`} className={`${iconeBtn} list-none [&::-webkit-details-marker]:hidden`}>
                <MoreVertical className="size-4" />
              </summary>
              <div className={menuCaixa}>
                <button onClick={(e) => { fecharMenu(e.currentTarget); ops.duplicar(i); }} className={menuItem}><Copy className="size-4" /> Duplicar</button>
                <button onClick={(e) => { fecharMenu(e.currentTarget); ops.mover(i); }} className={menuItem}><ArrowRightLeft className="size-4" /> Mover para…</button>
                <button onClick={(e) => { fecharMenu(e.currentTarget); ops.excluirItem(i); }} className={`${menuItem} text-red-600`}><Trash2 className="size-4" /> Excluir</button>
              </div>
            </details>
          </>
        )}
      </div>
    </li>
  );
}

// Drawer lateral: descrição, foto grande e o resto dos campos. Tudo salva sozinho.
export function DrawerItem({ item: i, categorias, ops, enviandoFoto, fechar }: {
  item: ItemEd; categorias: Categoria[]; ops: Ops; enviandoFoto: boolean; fechar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const rotulo = "mb-1 block text-sm font-medium";
  const campo = "w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-base focus:border-rose-500 focus:outline-none dark:border-neutral-700";

  return (
    <dialog ref={ref} onClose={fechar} aria-labelledby="drawer-titulo"
      onClick={(e) => e.target === ref.current && ref.current.close()}
      className="animate-deslizar m-0 ml-auto h-dvh max-h-dvh w-full max-w-md bg-white p-0 text-neutral-900 backdrop:bg-black/40 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <h2 id="drawer-titulo" className="min-w-0 flex-1 truncate text-lg font-bold">Editar produto</h2>
          <button onClick={() => ref.current?.close()} aria-label="Fechar" className={iconeBtn}><X className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <EscolherFoto item={i} ops={ops} rotulo={i.foto_url ? "Trocar foto" : "Adicionar foto"}
            className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800">
            {i.foto_url && <img src={i.foto_url} alt="" className="size-full object-cover" />}
            <span className={`absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm font-semibold ${
              i.foto_url ? "bg-black/0 text-transparent group-hover:bg-black/45 group-hover:text-white" : "text-neutral-500"}`}>
              {enviandoFoto ? <Loader2 className="size-6 animate-spin text-white" /> : <ImagePlus className="size-7" />}
              {i.foto_url ? "Trocar foto" : "Adicionar foto"}
            </span>
          </EscolherFoto>
          {i.foto_url && (
            <button onClick={() => ops.atualizarItem(i.id, { foto_url: null })} className="text-sm text-red-600 hover:underline">Remover foto</button>
          )}
          <label className="block"><span className={rotulo}>Nome</span>
            <input key={i.nome} defaultValue={i.nome} maxLength={80} onBlur={(e) => salvarNome(i, ops, e.target)} onKeyDown={blurNoEnter}
              className={`${campo} h-11`} />
          </label>
          <div className="block"><span className={rotulo}>Preço</span><CampoPreco item={i} ops={ops} className="h-11 w-40 border-neutral-300" /></div>
          <label className="block"><span className={rotulo}>Descrição</span>
            <textarea key={i.descricao ?? ""} defaultValue={i.descricao ?? ""} rows={4} maxLength={400}
              placeholder="Ingredientes, tamanho, acompanhamentos…"
              onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== i.descricao) ops.atualizarItem(i.id, { descricao: v }); }}
              className={`${campo} py-2`} />
          </label>
          <label className="block"><span className={rotulo}>Categoria</span>
            <select value={i.categoria_id} className={`${campo} h-11 dark:bg-neutral-900`}
              onChange={(e) => ops.atualizarItem(i.id, { categoria_id: e.target.value })}>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <section className="space-y-3 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-sm font-medium">Perguntar ponto da carne</span>
              <input type="checkbox" role="switch" checked={i.ponto_carne_ativo}
                onChange={(e) => ops.atualizarItem(i.id, { ponto_carne_ativo: e.target.checked,
                  ...(!i.ponto_carne_opcoes.length ? { ponto_carne_opcoes: ["Mal passado", "Ao ponto", "Bem passado"] } : {}),
                })}
                className="size-5 accent-rose-600" />
            </label>
            {i.ponto_carne_ativo && (
              <>
                <label className="block"><span className={rotulo}>Opções (uma por linha)</span>
                  <textarea key={i.ponto_carne_opcoes.join("\n")} defaultValue={i.ponto_carne_opcoes.join("\n")} rows={4}
                    maxLength={500} aria-label="Opções de ponto da carne, uma por linha"
                    onBlur={(e) => {
                      const opcoes = [...new Set(e.target.value.split("\n").map((o) => o.trim()).filter(Boolean))];
                      if (!opcoes.length || opcoes.length > 10) {
                        e.target.value = i.ponto_carne_opcoes.join("\n");
                        return toast.erro("Informe de 1 a 10 opções de ponto da carne");
                      }
                      if (JSON.stringify(opcoes) !== JSON.stringify(i.ponto_carne_opcoes)) {
                        ops.atualizarItem(i.id, { ponto_carne_opcoes: opcoes });
                      }
                    }}
                    className={`${campo} py-2`} />
                </label>
                <label className="flex min-h-11 items-center justify-between gap-3">
                  <span className="text-sm font-medium">Escolha obrigatória</span>
                  <input type="checkbox" role="switch" checked={i.ponto_carne_obrigatorio}
                    onChange={(e) => ops.atualizarItem(i.id, { ponto_carne_obrigatorio: e.target.checked })}
                    className="size-5 accent-rose-600" />
                </label>
              </>
            )}
          </section>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
            <span className="text-sm font-medium">Situação</span><Disponivel item={i} ops={ops} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
            <span className="text-sm font-medium">Destaque no cardápio</span><Destaque item={i} ops={ops} />
          </div>
        </div>
        <footer className="border-t border-neutral-200 p-4 dark:border-neutral-800">
          <button onClick={() => ops.excluirItem(i)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-300 font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950">
            <Trash2 className="size-4" /> Excluir produto
          </button>
        </footer>
      </div>
    </dialog>
  );
}
