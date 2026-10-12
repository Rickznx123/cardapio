"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  Ativo, atualizar, botao, botaoIcone, Campo, card, input, inputNum, ok, remover, rotulo, supabase, useLista, valor,
} from "./ui";

type Bairro = { id: string; nome: string; taxa: number; pedido_minimo: number; ativo: boolean };

const br = (n: number) => String(n).replace(".", ",");

export function Bairros({ empresaId }: { empresaId: string }) {
  const [lista, recarregar] = useLista<Bairro>("bairros", empresaId, "nome");

  async function adicionar(f: FormData) {
    const novo = {
      empresa_id: empresaId,
      nome: String(f.get("nome")).trim(),
      taxa: valor(f.get("taxa")),
      pedido_minimo: valor(f.get("pedido_minimo")),
    };
    if (await ok(supabase.from("bairros").insert(novo), "Bairro adicionado")) recarregar();
  }

  return (
    <div className="space-y-4">
      <form action={adicionar} className={`${card} grid grid-cols-2 gap-3`}>
        <label className="col-span-2"><span className={rotulo}>Bairro</span>
          <input name="nome" required className={input} />
        </label>
        <label><span className={rotulo}>Taxa (R$)</span>
          <input name="taxa" inputMode="decimal" placeholder="0,00" className={input} />
        </label>
        <label><span className={rotulo}>Pedido mínimo (R$)</span>
          <input name="pedido_minimo" inputMode="decimal" placeholder="0,00" className={input} />
        </label>
        <button className={`${botao} col-span-2`}><Plus className="size-5" /> Adicionar bairro</button>
      </form>
      {lista.length > 0 && (
        <ul className={`${card} divide-y divide-neutral-200 p-0 dark:divide-neutral-800`}>
          {lista.map((b) => (
            <li key={b.id} className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <Campo valor={b.nome} required aria-label="Nome do bairro" salvar={(v) => atualizar("bairros", b.id, { nome: v })} />
                <Ativo marcado={b.ativo} rotulo="" salvar={(v) => atualizar("bairros", b.id, { ativo: v })} />
                <button className={botaoIcone} aria-label={`Excluir ${b.nome}`} onClick={() => remover("bairros", b.id, recarregar)}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <label className="flex items-center gap-2">Taxa R$
                  <Campo valor={br(b.taxa)} inputMode="decimal" className={inputNum}
                    salvar={(v) => atualizar("bairros", b.id, { taxa: valor(v) })} />
                </label>
                <label className="flex items-center gap-2">Mínimo R$
                  <Campo valor={br(b.pedido_minimo)} inputMode="decimal" className={inputNum}
                    salvar={(v) => atualizar("bairros", b.id, { pedido_minimo: valor(v) })} />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
