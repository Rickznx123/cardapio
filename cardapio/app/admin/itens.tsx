"use client";

import { useState } from "react";
import { enviarFoto } from "@/lib/foto";
import type { Categoria } from "./categorias";
import { atualizar, botao, botaoSec, brl, input, ok, remover, supabase, useLista, valor } from "./ui";

type Item = {
  id: string; categoria_id: string; nome: string; descricao: string | null;
  preco: number; foto_url: string | null; disponivel: boolean; ordem: number;
};

export function Itens({ empresaId }: { empresaId: string }) {
  const [categorias] = useLista<Categoria>("categorias", empresaId, "ordem");
  const [itens, recarregar] = useLista<Item>("itens", empresaId, "ordem");
  const [editando, setEditando] = useState<Item | "novo" | null>(null);

  if (!categorias.length) return <p>Cadastre uma categoria primeiro.</p>;

  return (
    <div className="space-y-4">
      {editando ? (
        <ItemForm key={editando === "novo" ? "novo" : editando.id} empresaId={empresaId} categorias={categorias}
          item={editando === "novo" ? null : editando}
          fechar={(salvou) => { setEditando(null); if (salvou) recarregar(); }} />
      ) : (
        <button className={botao} onClick={() => setEditando("novo")}>+ Novo item</button>
      )}

      {categorias.map((c) => (
        <section key={c.id}>
          <h2 className="mb-2 font-bold">{c.nome}</h2>
          <ul className="space-y-2">
            {itens.filter((i) => i.categoria_id === c.id).map((i) => (
              <li key={i.id} className="flex items-center gap-3 rounded border p-2">
                {i.foto_url
                  ? <img src={i.foto_url} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
                  : <div className="h-14 w-14 shrink-0 rounded bg-gray-200" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.nome}</p>
                  <p className="text-sm">{brl(Number(i.preco))}</p>
                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" defaultChecked={i.disponivel}
                      onChange={(e) => atualizar("itens", i.id, { disponivel: e.target.checked })} />
                    Disponível
                  </label>
                </div>
                <div className="flex flex-col gap-1">
                  <button className={botaoSec} onClick={() => setEditando(i)}>Editar</button>
                  <button className={botaoSec} onClick={() => remover("itens", i.id, recarregar)}>Excluir</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
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
      if (await ok(q)) fechar(true);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); salvar(new FormData(e.currentTarget)); }} className="space-y-2 rounded border p-3">
      <h2 className="font-semibold">{item ? "Editar item" : "Novo item"}</h2>
      <select name="categoria_id" defaultValue={item?.categoria_id} className={input}>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <input name="nome" required placeholder="Nome" defaultValue={item?.nome} className={input} />
      <textarea name="descricao" placeholder="Descrição" defaultValue={item?.descricao ?? ""} className={input} />
      <div className="flex gap-2">
        <label className="flex-1 text-sm">Preço (R$)
          <input name="preco" required inputMode="decimal" pattern="\d+([,.]\d{1,2})?" placeholder="0,00"
            defaultValue={item ? String(item.preco).replace(".", ",") : ""} className={input} />
        </label>
        <label className="w-20 text-sm">Ordem
          <input name="ordem" type="number" defaultValue={item?.ordem ?? 0} className={input} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        {item?.foto_url && <img src={item.foto_url} alt="" className="h-16 w-16 rounded object-cover" />}
        <label className="text-sm">Foto<input name="foto" type="file" accept="image/*" className="block" /></label>
      </div>
      <div className="flex gap-2">
        <button disabled={salvando} className={botao}>{salvando ? "Salvando…" : "Salvar"}</button>
        <button type="button" className={botaoSec} onClick={() => fechar(false)}>Cancelar</button>
      </div>
    </form>
  );
}
