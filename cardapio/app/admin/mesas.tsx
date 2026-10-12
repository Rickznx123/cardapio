"use client";

import { Ativo, atualizar, botao, input, ok, remover, supabase, useLista } from "./ui";

type Mesa = { id: string; numero: number; ativo: boolean };

export function Mesas({ empresaId }: { empresaId: string }) {
  const [lista, recarregar] = useLista<Mesa>("mesas", empresaId, "numero");

  async function adicionar(f: FormData) {
    const numero = Number(f.get("numero"));
    if (await ok(supabase.from("mesas").insert({ empresa_id: empresaId, numero }))) recarregar();
  }

  return (
    <div className="space-y-4">
      <form action={adicionar} className="flex gap-2">
        <input name="numero" type="number" min={1} required placeholder="Nº da mesa"
          key={lista.length} defaultValue={(lista.at(-1)?.numero ?? 0) + 1} className={input} />
        <button className={botao}>Adicionar</button>
      </form>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {lista.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 rounded border p-2">
            <span className="font-semibold">Mesa {m.numero}</span>
            <Ativo marcado={m.ativo} rotulo="" salvar={(v) => atualizar("mesas", m.id, { ativo: v })} />
            <button aria-label={`Excluir mesa ${m.numero}`} className="text-sm text-red-600"
              onClick={() => remover("mesas", m.id, recarregar)}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
