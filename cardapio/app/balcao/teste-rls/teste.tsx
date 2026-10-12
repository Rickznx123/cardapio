"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Pedido = { id: string; numero: number; status: string; tipo: string };

export function TesteRls() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [id, setId] = useState("");
  const [resultado, setResultado] = useState("");

  useEffect(() => {
    supabase.from("pedidos").select("id, numero, status, tipo").neq("status", "cancelado")
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data, error }) => {
        if (error) return setResultado(`Erro ao listar: ${error.message}`);
        setPedidos(data);
        setId(data[0]?.id ?? "");
      });
  }, []);

  async function tentar() {
    const { data, error } = await supabase.from("pedidos").update({ status: "cancelado" }).eq("id", id).select("id, numero, status");
    setResultado(JSON.stringify(error ? { bloqueado: true, error } : { bloqueado: false, data }, null, 2));
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-3 p-4">
      <h1 className="text-xl font-bold">Teste RLS: update direto para cancelado</h1>
      <p className="text-sm text-gray-500">
        Esperado com a 004 aplicada: erro 42501 (&quot;new row violates row-level security policy&quot;).
        Se passar, o pedido fica cancelado <b>sem</b> descontar da comanda.
      </p>
      {pedidos.length === 0 ? (
        <p>Nenhum pedido não cancelado visível para este usuário.</p>
      ) : (
        <>
          <select value={id} onChange={(e) => setId(e.target.value)} className="w-full rounded border p-2">
            {pedidos.map((p) => <option key={p.id} value={p.id}>#{p.numero} · {p.tipo} · {p.status}</option>)}
          </select>
          <button onClick={tentar} className="rounded bg-rose-600 px-4 py-2 font-semibold text-white">
            Tentar cancelar direto
          </button>
        </>
      )}
      {resultado && <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-sm dark:bg-gray-900">{resultado}</pre>}
    </main>
  );
}
