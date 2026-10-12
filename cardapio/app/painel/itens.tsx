"use client";

import { useState } from "react";
import { ImageOff, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/toast";
import { enviarFoto } from "@/lib/foto";
import type { Categoria } from "./categorias";
import {
  atualizar, botao, botaoIcone, botaoSec, brl, card, FotoInput, input, ok, remover, rotulo, supabase, useLista, valor,
} from "./ui";

type Item = {
  id: string; categoria_id: string; nome: string; descricao: string | null;
  preco: number; foto_url: string | null; disponivel: boolean; ordem: number;
};

export function Itens({ empresaId }: { empresaId: string }) {
  const [categorias] = useLista<Categoria>("categorias", empresaId, "ordem");
  const [itens, recarregar] = useLista<Item>("itens", empresaId, "ordem");
  const [editando, setEditando] = useState<Item | "novo" | null>(null);

  if (!categorias.length) {
    return <p className={`${card} text-neutral-600 dark:text-neutral-300`}>Cadastre uma categoria primeiro na aba Categorias.</p>;
  }

  return (
    <div className="space-y-5">
      {editando ? (
        <ItemForm key={editando === "novo" ? "novo" : editando.id} empresaId={empresaId} categorias={categorias}
          item={editando === "novo" ? null : editando}
          fechar={(salvou) => { setEditando(null); if (salvou) recarregar(); }} />
      ) : (
        <button className={botao} onClick={() => setEditando("novo")}><Plus className="size-5" /> Novo item</button>
      )}

      {categorias.map((c) => {
        const daCat = itens.filter((i) => i.categoria_id === c.id);
        return (
          <section key={c.id}>
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              {c.nome} <span className="text-sm font-normal text-neutral-500">({daCat.length})</span>
            </h2>
            {daCat.length === 0 ? (
              <p className="text-sm text-neutral-500">Nenhum item nesta categoria.</p>
            ) : (
              <ul className={`${card} divide-y divide-neutral-200 p-0 dark:divide-neutral-800`}>
                {daCat.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 p-3">
                    {i.foto_url ? (
                      <img src={i.foto_url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
                        <ImageOff className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.nome}</p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">{brl(Number(i.preco))}</p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" defaultChecked={i.disponivel} className="size-5 accent-rose-600"
                        onChange={(e) => atualizar("itens", i.id, { disponivel: e.target.checked })} />
                      <span className="hidden sm:inline">Disponível</span>
                    </label>
                    <button className={botaoSec} onClick={() => setEditando(i)} aria-label={`Editar ${i.nome}`}>
                      <Pencil className="size-4" /><span className="hidden sm:inline">Editar</span>
                    </button>
                    <button className={botaoIcone} onClick={() => remover("itens", i.id, recarregar)} aria-label={`Excluir ${i.nome}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ItemForm({ empresaId, categorias, item, fechar }: {
  empresaId: string; categorias: Categoria[]; item: Item | null; fechar: (salvou: boolean) => void;
}) {
  const [salvando, setSalvando] = useState(false);

  async function salvar(f: FormData) {
    setSalvando(true);
    try {
      const foto = f.get("foto") as File;
      const campos = {
        empresa_id: empresaId,
        categoria_id: String(f.get("categoria_id")),
        nome: String(f.get("nome")).trim(),
        descricao: String(f.get("descricao")).trim() || null,
        preco: valor(f.get("preco")),
        ordem: Number(f.get("ordem")) || 0,
        foto_url: foto.size ? await enviarFoto(supabase, empresaId, foto) : (item?.foto_url ?? null),
      };
      const q = item
        ? supabase.from("itens").update(campos).eq("id", item.id)
        : supabase.from("itens").insert(campos);
      if (await ok(q, item ? "Item atualizado" : "Item criado")) fechar(true);
    } catch (e) {
      toast.erro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); salvar(new FormData(e.currentTarget)); }}
      className={`${card} space-y-4 border-rose-200 dark:border-rose-900`}>
      <h2 className="text-lg font-semibold">{item ? "Editar item" : "Novo item"}</h2>
      <FotoInput name="foto" atual={item?.foto_url ?? null} titulo="Foto do item" />
      <label className="block"><span className={rotulo}>Categoria</span>
        <select name="categoria_id" defaultValue={item?.categoria_id} className={input}>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </label>
      <label className="block"><span className={rotulo}>Nome</span>
        <input name="nome" required defaultValue={item?.nome} className={input} />
      </label>
      <label className="block"><span className={rotulo}>Descrição</span>
        <textarea name="descricao" rows={2} defaultValue={item?.descricao ?? ""} className={`${input} h-auto py-2`} />
      </label>
      <div className="flex gap-3">
        <label className="flex-1"><span className={rotulo}>Preço (R$)</span>
          <input name="preco" required inputMode="decimal" pattern="\d+([,.]\d{1,2})?" placeholder="0,00"
            defaultValue={item ? String(item.preco).replace(".", ",") : ""} className={input} />
        </label>
        <label className="w-24"><span className={rotulo}>Ordem</span>
          <input name="ordem" type="number" defaultValue={item?.ordem ?? 0} className={input} />
        </label>
      </div>
      <div className="flex gap-2">
        <button disabled={salvando} className={botao}>{salvando ? "Salvando…" : "Salvar"}</button>
        <button type="button" className={`${botaoSec} h-11`} onClick={() => fechar(false)}>Cancelar</button>
      </div>
    </form>
  );
}
