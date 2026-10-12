"use client";

import { type LinhaCarrinho, mudarObs, mudarQtd, novaLinha } from "@/lib/linhas";
import { brl } from "@/lib/tipos";

// Uma linha do carrinho: −/+, observação e "+ adicionar com outra observação".
export function LinhaEditor({ linha, linhas, setLinhas, nome, preco }: {
  linha: LinhaCarrinho; linhas: LinhaCarrinho[]; setLinhas: (l: LinhaCarrinho[]) => void;
  nome?: string; preco: number;
}) {
  return (
    <div className="space-y-1 py-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {nome && <p className="truncate">{nome}</p>}
          <p className="text-sm text-gray-500">{brl(preco * linha.quantidade)}</p>
        </div>
        <button type="button" aria-label="Remover um" onClick={() => setLinhas(mudarQtd(linhas, linha.id, -1))}
          className="h-9 w-9 rounded-full border text-lg">−</button>
        <span className="w-6 text-center font-bold">{linha.quantidade}</span>
        <button type="button" aria-label="Adicionar um" onClick={() => setLinhas(mudarQtd(linhas, linha.id, 1))}
          className="h-9 w-9 rounded-full border text-lg">+</button>
      </div>
      <input value={linha.observacao} placeholder="Observação (ex: sem cebola)" aria-label="Observação"
        onChange={(e) => setLinhas(mudarObs(linhas, linha.id, e.target.value))}
        className="w-full rounded border p-2 text-sm" />
      <button type="button" onClick={() => setLinhas(novaLinha(linhas, linha.item_id))} className="text-sm underline">
        + adicionar com outra observação
      </button>
    </div>
  );
}
