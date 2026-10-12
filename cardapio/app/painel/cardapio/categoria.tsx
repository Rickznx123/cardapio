"use client";

import { useEffect, useRef } from "react";
import {
  closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Eye, EyeOff, GripVertical, MoreVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/toast";
import { LinhaItem } from "./item";
import { acessibilidadeDnd, type Categoria, fecharMenu, type ItemEd, menuCaixa, menuItem, type Ops } from "./tipos";

const iconeBtn = "flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800";

export function CategoriaCard({ categoria: c, itens, ops, aberta, alternar, focar, arrastavel, enviandoFoto }: {
  categoria: Categoria; itens: ItemEd[]; ops: Ops; aberta: boolean; alternar: () => void;
  focar: boolean; arrastavel: boolean; enviandoFoto: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id, disabled: !arrastavel });
  const nome = useRef<HTMLInputElement>(null);
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Categoria recém-criada: foca e seleciona o nome para digitar direto.
  useEffect(() => {
    if (focar) { nome.current?.focus(); nome.current?.select(); }
  }, [focar]);

  const salvos = itens.filter((i) => !i.rascunho);
  const rascunhos = itens.filter((i) => i.rascunho);

  function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = salvos.map((i) => i.id);
    ops.reordenarItens(c.id, arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  }

  return (
    <li ref={setNodeRef} id={`cat-${c.id}`} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`scroll-mt-32 rounded-2xl border bg-white shadow-sm lg:scroll-mt-16 dark:bg-neutral-900 ${
        isDragging ? "relative z-30 border-rose-400 shadow-xl" : "border-neutral-200 dark:border-neutral-800"} ${c.ativo ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-1.5 p-2 sm:p-3">
        {arrastavel && (
          <button {...attributes} {...listeners} aria-label={`Arrastar categoria ${c.nome}`}
            className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 active:cursor-grabbing dark:hover:bg-neutral-800">
            <GripVertical className="size-5" />
          </button>
        )}
        <button onClick={alternar} aria-expanded={aberta} aria-label={aberta ? "Recolher" : "Expandir"} className={iconeBtn}>
          <ChevronDown className={`size-5 transition-transform ${aberta ? "" : "-rotate-90"}`} />
        </button>
        <label className="min-w-0 flex-1 basis-40">
          <span className="block px-2 text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Nome da categoria</span>
          <input ref={nome} key={c.nome} defaultValue={c.nome} maxLength={60}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) { e.target.value = c.nome; return toast.erro("O nome da categoria não pode ficar vazio"); }
              if (v !== c.nome) ops.atualizarCategoria(c.id, { nome: v });
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-lg font-semibold hover:border-neutral-300 focus:border-rose-500 focus:outline-none dark:hover:border-neutral-700" />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold tabular-nums dark:bg-neutral-800">
            {salvos.length} {salvos.length === 1 ? "item" : "itens"}
          </span>
          <button onClick={() => ops.novoProduto(c.id)}
            className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950">
            <Plus className="size-4" /> Produto
          </button>
          <button onClick={() => ops.atualizarCategoria(c.id, { ativo: !c.ativo })} aria-pressed={!c.ativo}
            aria-label={c.ativo ? `Ocultar ${c.nome} do cardápio` : `Mostrar ${c.nome} no cardápio`}
            title={c.ativo ? "Visível no cardápio" : "Oculta no cardápio"} className={iconeBtn}>
            {c.ativo ? <Eye className="size-5" /> : <EyeOff className="size-5 text-neutral-400" />}
          </button>
          <details className="relative">
            <summary aria-label={`Mais ações de ${c.nome}`} className={`${iconeBtn} list-none [&::-webkit-details-marker]:hidden`}>
              <MoreVertical className="size-5" />
            </summary>
            <div className={menuCaixa}>
              <button onClick={(e) => { fecharMenu(e.currentTarget); ops.excluirCategoria(c); }} className={`${menuItem} text-red-600`}>
                <Trash2 className="size-4" /> Excluir categoria
              </button>
            </div>
          </details>
        </div>
      </div>

      {aberta && (
        <div className="border-t border-neutral-200 dark:border-neutral-800">
          {salvos.length === 0 && rascunhos.length === 0 && (
            <p className="px-4 py-3 text-sm text-neutral-500">Nenhum produto. Use &quot;+ Produto&quot; para adicionar.</p>
          )}
          <DndContext id={`dnd-itens-${c.id}`} sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar} accessibility={acessibilidadeDnd}>
            <SortableContext items={salvos.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {salvos.map((i) => (
                  <LinhaItem key={i.k ?? i.id} item={i} ops={ops} arrastavel={arrastavel} enviandoFoto={enviandoFoto === i.id} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {rascunhos.length > 0 && (
            <ul className="divide-y divide-neutral-100 border-t border-neutral-100 dark:divide-neutral-800 dark:border-neutral-800">
              {rascunhos.map((i) => (
                <LinhaItem key={i.k ?? i.id} item={i} ops={ops} arrastavel={false} enviandoFoto={false} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
