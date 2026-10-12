"use client";

import { Plus, Trash2 } from "lucide-react";
import { Ativo, atualizar, botao, botaoIcone, card, input, ok, remover, supabase, useLista } from "./ui";

type Mesa = { id: string; numero: number; ativo: boolean };

export function Mesas({ empresaId }: { empresaId: string }) {
  const [lista, recarregar] = useLista<Mesa>("mesas", empresaId, "numero");

  async function adicionar(f: FormData) {
    const numero = Number(f.get("numero"));
    if (await ok(supabase.from("mesas").insert({ empresa_id: empresaId, numero }), `Mesa ${numero} criada`)) recarregar();
  }

  return (
    <div className="space-y-4">
      <form action={adicionar} className={`${card} flex gap-2`}>
        <input name="numero" type="number" min={1} required placeholder="Nº da mesa" aria-label="Número da mesa"
          key={lista.length} defaultValue={(lista.at(-1)?.numero ?? 0) + 1} className={input} />
        <button className={botao}><Plus className="size-5" /> Adicionar</button>
      </form>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {lista.map((m) => (
          <li key={m.id} className={`${card} flex items-center gap-2 p-3 ${m.ativo ? "" : "opacity-60"}`}>
            <span className="flex-1 text-lg font-bold">Mesa {m.numero}</span>
            <Ativo marcado={m.ativo} rotulo="" salvar={(v) => atualizar("mesas", m.id, { ativo: v }).then(recarregar)} />
            <button aria-label={`Excluir mesa ${m.numero}`} className={botaoIcone} onClick={() => remover("mesas", m.id, recarregar)}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
