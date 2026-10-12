"use client";

import { useEffect, useState } from "react";
import { Clock, Lock, Receipt } from "lucide-react";
import { toast } from "@/components/toast";
import { preConta, type PedidoBalcao, SELECT_PEDIDO } from "@/lib/cupom";
import { imprimir } from "@/lib/impressao";
import { createClient } from "@/lib/supabase/client";
import { brl } from "@/lib/tipos";

const supabase = createClient();

type Comanda = { id: string; total: number; aberta_em: string; mesas: { numero: number } };

// Comandas abertas: imprimir conta (pré-conta) e fechar. `versao` muda quando chega pedido de mesa.
export function Mesas({ empresaId, empresaNome, versao }: { empresaId: string; empresaNome: string; versao: number }) {
  const [comandas, setComandas] = useState<Comanda[] | null>(null);
  const [local, setLocal] = useState(0);

  useEffect(() => {
    supabase.from("comandas").select("id, total, aberta_em, mesas(numero)")
      .eq("empresa_id", empresaId).eq("status", "aberta").order("aberta_em")
      .then(({ data, error }) => (error ? toast.erro(error.message) : setComandas(data as unknown as Comanda[])));
  }, [empresaId, versao, local]);

  async function imprimirConta(c: Comanda) {
    const { data, error } = await supabase.from("pedidos").select(SELECT_PEDIDO)
      .eq("comanda_id", c.id).order("created_at");
    if (error) return toast.erro(error.message);
    imprimir(preConta(empresaNome, c.mesas.numero, data as unknown as PedidoBalcao[]));
    toast.ok(`Imprimindo conta da mesa ${c.mesas.numero}`);
  }

  async function fechar(c: Comanda) {
    if (!confirm(`Fechar a comanda da mesa ${c.mesas.numero} (${brl(c.total)})?`)) return;
    const { error } = await supabase.from("comandas")
      .update({ status: "fechada", fechada_em: new Date().toISOString() })
      .eq("id", c.id).eq("status", "aberta");
    if (error) return toast.erro(error.message);
    toast.ok(`Mesa ${c.mesas.numero} fechada`);
    setLocal((v) => v + 1);
  }

  if (comandas === null) return <p className="p-4 text-lg">Carregando…</p>;
  if (!comandas.length) return <p className="p-4 text-lg text-neutral-500">Nenhuma mesa com comanda aberta.</p>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {comandas.map((c) => (
        <li key={c.id} className="rounded-2xl border-t-8 border-sky-700 bg-white p-4 shadow-sm dark:bg-neutral-800">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-4xl font-black">Mesa {c.mesas.numero}</span>
          </div>
          <p className="mt-1 text-3xl font-bold tabular-nums">{brl(c.total)}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
            <Clock className="size-4" /> Aberta às {new Date(c.aberta_em).toLocaleTimeString("pt-BR", { timeStyle: "short" })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => imprimirConta(c)}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border border-neutral-300 font-semibold dark:border-neutral-600">
              <Receipt className="size-5" /> Conta
            </button>
            <button onClick={() => fechar(c)}
              className="flex h-12 items-center justify-center gap-2 rounded-lg bg-neutral-900 font-semibold text-white dark:bg-white dark:text-neutral-900">
              <Lock className="size-5" /> Fechar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
