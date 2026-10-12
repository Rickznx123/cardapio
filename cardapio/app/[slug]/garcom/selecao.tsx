"use client";

import { useState } from "react";
import { CircleCheck, X } from "lucide-react";
import { SeletorItens, useCardapio } from "@/components/seletor-itens";
import { toast } from "@/components/toast";
import { type LinhaCarrinho, paraRpc } from "@/lib/linhas";
import { createClient } from "@/lib/supabase/client";
import { brl } from "@/lib/tipos";

const supabase = createClient();

export function Selecao({ empresaId, mesa, cancelar, enviado }: {
  empresaId: string; mesa: { id: string; numero: number }; cancelar: () => void; enviado: () => void;
}) {
  const cardapio = useCardapio(empresaId);
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);
  const [obsGeral, setObsGeral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const preco = (id: string) => cardapio?.itens.find((i) => i.id === id)?.preco ?? 0;
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const total = linhas.reduce((s, l) => s + preco(l.item_id) * l.quantidade, 0);

  async function enviar() {
    setEnviando(true);
    const { error } = await supabase.rpc("criar_pedido_mesa", {
      p_mesa_id: mesa.id,
      p_itens: paraRpc(linhas),
      p_observacao: obsGeral.trim() || null,
    });
    if (error) {
      setEnviando(false);
      return toast.erro(error.message);
    }
    navigator.vibrate?.(80);
    setSucesso(true);
    setTimeout(enviado, 1300);
  }

  if (sucesso) {
    return (
      <main role="status" className="animate-surgir fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-emerald-600 text-white">
        <CircleCheck className="size-24" strokeWidth={1.5} />
        <p className="text-3xl font-bold">Pedido enviado!</p>
        <p className="text-xl">Mesa {mesa.numero} · {qtd} {qtd === 1 ? "item" : "itens"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl pb-44">
      <header className="flex h-16 items-center gap-2 border-b border-neutral-200 bg-white px-3 dark:border-neutral-800 dark:bg-neutral-900">
        <button onClick={cancelar} aria-label="Cancelar e voltar"
          className="flex size-12 items-center justify-center rounded-full active:bg-neutral-200 dark:active:bg-neutral-800">
          <X className="size-6" />
        </button>
        <h1 className="text-xl font-bold">Mesa {mesa.numero}</h1>
      </header>

      {cardapio ? (
        <SeletorItens categorias={cardapio.categorias} itens={cardapio.itens} linhas={linhas} setLinhas={setLinhas} />
      ) : (
        <div className="space-y-3 p-3">{[0, 1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800" />)}</div>
      )}

      {qtd > 0 && (
        <div className="fixed inset-x-0 bottom-0 space-y-2 border-t border-neutral-200 bg-(--background) p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] dark:border-neutral-800">
          <input value={obsGeral} onChange={(e) => setObsGeral(e.target.value)} placeholder="Observação do pedido (opcional)"
            aria-label="Observação do pedido"
            className="mx-auto block h-12 w-full max-w-2xl rounded-xl border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700" />
          <button disabled={enviando} onClick={enviar}
            className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between rounded-2xl bg-rose-600 px-5 text-xl font-semibold text-white active:bg-rose-700 disabled:opacity-60">
            <span>{enviando ? "Enviando…" : `Enviar (${qtd})`}</span>
            <span>{brl(total)}</span>
          </button>
        </div>
      )}
    </main>
  );
}
