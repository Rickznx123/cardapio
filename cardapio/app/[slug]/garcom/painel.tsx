"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { brl } from "@/lib/tipos";
import { Selecao } from "./selecao";

const supabase = createClient();

export type Membro = { id: string; nome: string; empresa_id: string };
type Mesa = { id: string; numero: number };
type Comanda = { id: string; mesa_id: string; total: number };
type ItemComanda = {
  id: string; nome: string; preco: number; quantidade: number; observacao: string | null;
  pedidos: { numero: number; status: string };
};

export function Painel({ membro }: { membro: Membro }) {
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [versao, setVersao] = useState(0);
  const recarregar = () => setVersao((v) => v + 1);

  useEffect(() => {
    Promise.all([
      supabase.from("mesas").select("id, numero").eq("empresa_id", membro.empresa_id).eq("ativo", true).order("numero"),
      supabase.from("comandas").select("id, mesa_id, total").eq("empresa_id", membro.empresa_id).eq("status", "aberta"),
    ]).then(([m, c]) => {
      if (m.error || c.error) return alert((m.error ?? c.error)!.message);
      setMesas(m.data);
      setComandas(c.data);
    });
  }, [membro.empresa_id, versao]);

  async function sair() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  if (mesa) {
    return (
      <MesaView membro={membro} mesa={mesa} comanda={comandas.find((c) => c.mesa_id === mesa.id)}
        voltar={() => { setMesa(null); recarregar(); }} atualizou={recarregar} />
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Mesas</h1>
        <div className="flex gap-3 text-sm">
          <button onClick={recarregar} className="underline">Atualizar</button>
          <button onClick={sair} className="underline">Sair ({membro.nome})</button>
        </div>
      </header>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {mesas.map((m) => {
          const c = comandas.find((x) => x.mesa_id === m.id);
          return (
            <li key={m.id}>
              <button onClick={() => setMesa(m)}
                className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg border-2 ${c ? "border-rose-600 bg-rose-50" : ""}`}>
                <span className="text-2xl font-bold">{m.numero}</span>
                <span className="text-xs">{c ? brl(c.total) : "livre"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {mesas.length === 0 && <p>Nenhuma mesa cadastrada.</p>}
    </main>
  );
}

function MesaView({ membro, mesa, comanda, voltar, atualizou }: {
  membro: Membro; mesa: Mesa; comanda?: Comanda; voltar: () => void; atualizou: () => void;
}) {
  const [itens, setItens] = useState<ItemComanda[]>([]);
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    if (!comanda) return;
    supabase.from("pedido_itens")
      .select("id, nome, preco, quantidade, observacao, pedidos!inner(numero, status, comanda_id)")
      .eq("pedidos.comanda_id", comanda.id)
      .then(({ data, error }) => {
        if (error) return alert(error.message);
        const lista = data as unknown as ItemComanda[];
        setItens(lista.sort((a, b) => a.pedidos.numero - b.pedidos.numero));
      });
  }, [comanda]);

  if (adicionando) {
    return (
      <Selecao empresaId={membro.empresa_id} mesa={mesa}
        cancelar={() => setAdicionando(false)}
        enviado={() => { setAdicionando(false); atualizou(); }} />
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pb-24">
      <button onClick={voltar} className="mb-3 text-sm underline">← Mesas</button>
      <h1 className="mb-3 text-2xl font-bold">Mesa {mesa.numero}</h1>
      {comanda ? (
        <>
          <ul className="divide-y">
            {itens.map((i) => (
              <li key={i.id} className={`flex justify-between gap-2 py-2 ${i.pedidos.status === "cancelado" ? "line-through opacity-50" : ""}`}>
                <div>
                  <p>{i.quantidade}x {i.nome}</p>
                  {i.observacao && <p className="text-sm text-gray-500">{i.observacao}</p>}
                  <p className="text-xs text-gray-400">Pedido #{i.pedidos.numero} · {i.pedidos.status}</p>
                </div>
                <span>{brl(i.preco * i.quantidade)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">
            <span>Total</span><span>{brl(comanda.total)}</span>
          </p>
        </>
      ) : (
        <p className="text-gray-500">Mesa livre. Ao enviar o primeiro pedido a comanda é aberta.</p>
      )}
      <div className="fixed inset-x-0 bottom-0 p-3">
        <button onClick={() => setAdicionando(true)}
          className="mx-auto block w-full max-w-2xl rounded-lg bg-rose-600 p-4 font-semibold text-white">
          Adicionar itens
        </button>
      </div>
    </main>
  );
}
