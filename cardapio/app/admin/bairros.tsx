"use client";

import { Ativo, atualizar, botao, botaoSec, Campo, input, ok, remover, supabase, useLista, valor } from "./ui";

type Bairro = { id: string; nome: string; taxa: number; pedido_minimo: number; ativo: boolean };

const num = "w-24 rounded border p-2";
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
    if (await ok(supabase.from("bairros").insert(novo))) recarregar();
  }

  return (
    <div className="space-y-4">
      <form action={adicionar} className="grid grid-cols-2 gap-2">
        <input name="nome" required placeholder="Bairro" className={`${input} col-span-2`} />
        <label className="text-sm">Taxa (R$)<input name="taxa" inputMode="decimal" placeholder="0,00" className={input} /></label>
        <label className="text-sm">Pedido mínimo (R$)<input name="pedido_minimo" inputMode="decimal" placeholder="0,00" className={input} /></label>
        <button className={`${botao} col-span-2`}>Adicionar bairro</button>
      </form>
      <ul className="space-y-3">
        {lista.map((b) => (
          <li key={b.id} className="space-y-2 rounded border p-2">
            <div className="flex items-center gap-2">
              <Campo valor={b.nome} required salvar={(v) => atualizar("bairros", b.id, { nome: v })} />
              <Ativo marcado={b.ativo} salvar={(v) => atualizar("bairros", b.id, { ativo: v })} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              Taxa R$
              <Campo valor={br(b.taxa)} inputMode="decimal" className={num}
                salvar={(v) => atualizar("bairros", b.id, { taxa: valor(v) })} />
              Mínimo R$
              <Campo valor={br(b.pedido_minimo)} inputMode="decimal" className={num}
                salvar={(v) => atualizar("bairros", b.id, { pedido_minimo: valor(v) })} />
              <button className={`${botaoSec} ml-auto`} onClick={() => remover("bairros", b.id, recarregar)}>Excluir</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
