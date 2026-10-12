"use client";

import { Plus, Trash2 } from "lucide-react";
import { Ativo, atualizar, botao, botaoIcone, Campo, card, input, ok, remover, supabase, useLista } from "./ui";

export type Categoria = { id: string; nome: string; ordem: number; ativo: boolean };

export function Categorias({ empresaId }: { empresaId: string }) {
  const [lista, recarregar] = useLista<Categoria>("categorias", empresaId, "ordem");

  async function adicionar(f: FormData) {
    const nome = String(f.get("nome")).trim();
    if (await ok(supabase.from("categorias").insert({ empresa_id: empresaId, nome, ordem: lista.length }), "Categoria criada")) recarregar();
  }

  return (
    <div className="space-y-4">
      <form action={adicionar} className={`${card} flex gap-2`}>
        <input name="nome" required placeholder="Nova categoria (ex.: Lanches)" aria-label="Nome da nova categoria" className={input} />
        <button className={botao}><Plus className="size-5" /><span className="hidden sm:inline">Adicionar</span></button>
      </form>
      {lista.length > 0 && (
        <ul className={`${card} divide-y divide-neutral-200 p-0 dark:divide-neutral-800`}>
          {lista.map((c) => (
            <li key={c.id} className="flex items-center gap-2 p-3">
              <Campo valor={c.ordem} type="number" title="Ordem" aria-label="Ordem" className={`${input} w-16 px-2 text-center`}
                salvar={(v) => atualizar("categorias", c.id, { ordem: Number(v) }).then(recarregar)} />
              <Campo valor={c.nome} required aria-label="Nome" salvar={(v) => atualizar("categorias", c.id, { nome: v })} />
              <Ativo marcado={c.ativo} rotulo="" salvar={(v) => atualizar("categorias", c.id, { ativo: v })} />
              <button className={botaoIcone} aria-label={`Excluir ${c.nome}`} onClick={() => remover("categorias", c.id, recarregar)}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && (
        <p className="text-sm text-neutral-500">A caixa marca se a categoria aparece no cardápio. Excluir uma categoria apaga os itens dela.</p>
      )}
    </div>
  );
}
