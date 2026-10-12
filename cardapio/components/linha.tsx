"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { type LinhaCarrinho, mudarObs, mudarQtd, novaLinha } from "@/lib/linhas";
import { brl } from "@/lib/tipos";

// Uma linha do carrinho: −/+, observação e "+ adicionar com outra observação". Botões de 48px (uma mão).
export function LinhaEditor({ linha, linhas, setLinhas, nome, preco }: {
  linha: LinhaCarrinho; linhas: LinhaCarrinho[]; setLinhas: (l: LinhaCarrinho[]) => void;
  nome?: string; preco: number;
}) {
  const ultimo = linha.quantidade === 1;
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {nome && <p className="truncate font-medium">{nome}</p>}
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{brl(preco * linha.quantidade)}</p>
        </div>
        <div className="flex items-center rounded-full border border-neutral-300 dark:border-neutral-700">
          <button type="button" aria-label={ultimo ? "Remover" : "Diminuir quantidade"}
            onClick={() => setLinhas(mudarQtd(linhas, linha.id, -1))}
            className="flex size-12 items-center justify-center">
            {ultimo ? <Trash2 className="size-5 text-red-600" /> : <Minus className="size-5" />}
          </button>
          <span className="w-7 text-center text-lg font-bold" aria-live="polite">{linha.quantidade}</span>
          <button type="button" aria-label="Aumentar quantidade" onClick={() => setLinhas(mudarQtd(linhas, linha.id, 1))}
            className="flex size-12 items-center justify-center">
            <Plus className="size-5" />
          </button>
        </div>
      </div>
      <input value={linha.observacao} placeholder="Observação (ex.: sem cebola)" aria-label="Observação"
        onChange={(e) => setLinhas(mudarObs(linhas, linha.id, e.target.value))} maxLength={140}
        className="h-11 w-full rounded-xl border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700" />
      <button type="button" onClick={() => setLinhas(novaLinha(linhas, linha.item_id))}
        className="text-sm font-medium text-neutral-600 underline underline-offset-2 dark:text-neutral-300">
        + adicionar com outra observação
      </button>
    </div>
  );
}
