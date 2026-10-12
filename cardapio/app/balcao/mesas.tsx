"use client";

import { useEffect, useState } from "react";
import { preConta, type PedidoBalcao, SELECT_PEDIDO } from "@/lib/cupom";
import { imprimir } from "@/lib/impressao";
import { createClient } from "@/lib/supabase/client";
import { brl } from "@/lib/tipos";

const supabase = createClient();

type Comanda = { id: string; total: number; aberta_em: string; mesas: { numero: number } };

// Comandas abertas: imprimir conta (pré-conta) e fechar. `versao` muda quando chega pedido de mesa.
export function Mesas({ empresaId, empresaNome, versao }: { empresaId: string; empresaNome: string; versao: number }) {
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [local, setLocal] = useState(0);

  useEffect(() => {
    supabase.from("comandas").select("id, total, aberta_em, mesas(numero)")
      .eq("empresa_id", empresaId).eq("status", "aberta").order("aberta_em")
      .then(({ data, error }) => (error ? alert(error.message) : setComandas(data as unknown as Comanda[])));
  }, [empresaId, versao, local]);

  async function imprimirConta(c: Comanda) {
    const { data, error } = await supabase.from("pedidos").select(SELECT_PEDIDO)
      .eq("comanda_id", c.id).order("created_at");
    if (error) return alert(error.message);
    imprimir(preConta(empresaNome, c.mesas.numero, data as unknown as PedidoBalcao[]));
  }

  async function fechar(c: Comanda) {
    if (!confirm(`Fechar a comanda da mesa ${c.mesas.numero} (${brl(c.total)})?`)) return;
    const { error } = await supabase.from("comandas")
      .update({ status: "fechada", fechada_em: new Date().toISOString() })
      .eq("id", c.id).eq("status", "aberta");
    if (error) return alert(error.message);
    setLocal((v) => v + 1);
  }

  if (!comandas.length) return <p className="text-gray-500">Nenhuma mesa com comanda aberta.</p>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {comandas.map((c) => (
        <li key={c.id} className="rounded border p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold">Mesa {c.mesas.numero}</span>
            <span className="font-bold">{brl(c.total)}</span>
          </div>
          <p className="text-xs text-gray-500">
            Aberta às {new Date(c.aberta_em).toLocaleTimeString("pt-BR", { timeStyle: "short" })}
          </p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => imprimirConta(c)} className="rounded border px-3 py-1 text-sm">Imprimir conta</button>
            <button onClick={() => fechar(c)} className="rounded bg-rose-600 px-3 py-1 text-sm font-semibold text-white">
              Fechar comanda
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
