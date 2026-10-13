"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { brl, type ItemPublico } from "@/lib/tipos";

// Bottom sheet do item: foto grande, observação, quantidade, adicionar.
export function ItemSheet({ item, podePedir, adicionar, fechar }: {
  item: ItemPublico; podePedir: boolean;
  adicionar: (quantidade: number, observacao: string, pontoCarne: string | null) => void; fechar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState("");
  const [pontoCarne, setPontoCarne] = useState("");
  const opcoesPonto = item.ponto_carne_opcoes ?? [];

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} onClose={fechar} aria-labelledby="item-titulo"
      onClick={(e) => e.target === ref.current && ref.current.close()}
      className="animate-subir m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-white p-0 text-neutral-900 backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-3xl">
      <div className="flex max-h-[92dvh] flex-col">
        <div className="relative shrink-0">
          {item.foto_url ? (
            <img src={item.foto_url} alt="" className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="h-14" />
          )}
          <button onClick={() => ref.current?.close()} aria-label="Fechar"
            className="absolute top-3 right-3 flex size-10 items-center justify-center rounded-full bg-white/90 shadow">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 pt-4 pb-4">
          <h2 id="item-titulo" className="text-xl font-bold">{item.nome}</h2>
          {item.descricao && <p className="text-neutral-600">{item.descricao}</p>}
          <p className="text-lg font-bold">{brl(item.preco)}</p>
          {podePedir && (
            <>
            {item.ponto_carne_ativo && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium">
                  Ponto da carne{item.ponto_carne_obrigatorio ? " (obrigatório)" : " (opcional)"}
                </legend>
                <div className="grid gap-2">
                  {!item.ponto_carne_obrigatorio && (
                    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 px-3">
                      <input type="radio" name={`ponto-${item.id}`} value="" checked={!pontoCarne}
                        onChange={() => setPontoCarne("")} />
                      Sem preferência
                    </label>
                  )}
                  {opcoesPonto.map((opcao) => (
                    <label key={opcao} className="flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 px-3">
                      <input type="radio" name={`ponto-${item.id}`} value={opcao} checked={pontoCarne === opcao}
                        onChange={() => setPontoCarne(opcao)} />
                      {opcao}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Alguma observação?</span>
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={140} rows={2}
                placeholder="Ex.: sem cebola, molho à parte…"
                className="w-full rounded-xl border border-neutral-300 p-3 text-base outline-none focus:border-(--cor) focus:ring-2 focus:ring-(--cor)/30" />
            </label>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-neutral-200 p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {podePedir ? (
            <>
              <div className="flex items-center rounded-full border border-neutral-300">
                <button onClick={() => setQtd((q) => Math.max(1, q - 1))} aria-label="Diminuir quantidade"
                  className="flex size-12 items-center justify-center disabled:opacity-30" disabled={qtd <= 1}>
                  <Minus className="size-5" />
                </button>
                <span className="w-6 text-center text-lg font-semibold" aria-live="polite">{qtd}</span>
                <button onClick={() => setQtd((q) => q + 1)} aria-label="Aumentar quantidade"
                  className="flex size-12 items-center justify-center">
                  <Plus className="size-5" />
                </button>
              </div>
              <button disabled={Boolean(item.ponto_carne_ativo && item.ponto_carne_obrigatorio && !pontoCarne)}
                onClick={() => { adicionar(qtd, obs, pontoCarne || null); ref.current?.close(); }}
                className="flex h-12 flex-1 items-center justify-between rounded-full bg-(--cor) px-5 font-semibold text-(--cor-texto)">
                <span>Adicionar</span>
                <span>{brl(item.preco * qtd)}</span>
              </button>
            </>
          ) : (
            <p className="flex-1 text-center text-sm text-neutral-500">A loja está fechada para pedidos agora.</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
