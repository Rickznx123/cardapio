"use client";

import { Ativo, atualizar, botao, botaoSec, Campo, input, ok, remover, supabase, useLista } from "./ui";

export type Categoria = { id: string; nome: string; ordem: number; ativo: boolean };

export function Categorias({ empresaId }: { empresaId: string }) {
  const [lista, recarregar] = useLista<Categoria>("categorias", empresaId, "ordem");

  async function adicionar(f: FormData) {
    const nome = String(f.get("nome")).trim();
    if (await ok(supabase.from("categorias").insert({ empresa_id: empresaId, nome, ordem: lista.length }))) recarregar();
  }

  return (
    <div className="space-y-4">
      <form action={adicionar} className="flex gap-2">
        <input name="nome" required placeholder="Nova categoria" className={input} />
        <button className={botao}>Adicionar</button>
      </form>
      <ul className="space-y-2">
        {lista.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <Campo valor={c.ordem} type="number" title="Ordem" className="w-14 rounded border p-2"
              salvar={(v) => atualizar("categorias", c.id, { ordem: Number(v) }).then(recarregar)} />
            <Campo valor={c.nome} required salvar={(v) => atualizar("categorias", c.id, { nome: v })} />
            <Ativo marcado={c.ativo} salvar={(v) => atualizar("categorias", c.id, { ativo: v })} />
            <button className={botaoSec} onClick={() => remover("categorias", c.id, recarregar)}>Excluir</button>
          </li>
        ))}
      </ul>
      {lista.length > 0 && <p className="text-sm text-gray-500">Excluir uma categoria apaga os itens dela.</p>}
    </div>
  );
}
