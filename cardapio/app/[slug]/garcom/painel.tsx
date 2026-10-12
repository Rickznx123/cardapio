"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, LogOut, Plus, RefreshCw } from "lucide-react";
import { toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/client";
import { brl, STATUS, type StatusPedido } from "@/lib/tipos";
import { Selecao } from "./selecao";

const supabase = createClient();

export type Membro = { id: string; nome: string; empresa_id: string };
type Mesa = { id: string; numero: number };
type Comanda = { id: string; mesa_id: string; total: number };
type ItemComanda = {
  id: string; nome: string; preco: number; quantidade: number; observacao: string | null;
  pedidos: { numero: number; status: StatusPedido };
};

const iconeBtn = "flex size-12 items-center justify-center rounded-full active:bg-neutral-200 dark:active:bg-neutral-800";

export function Painel({ membro }: { membro: Membro }) {
  const [mesas, setMesas] = useState<Mesa[] | null>(null);
  const [comandas, setComandas] = useState<Comanda[]>([]);
  const [mesa, setMesa] = useState<Mesa | null>(null);
  const [versao, setVersao] = useState(0);
  const recarregar = () => setVersao((v) => v + 1);

  useEffect(() => {
    Promise.all([
      supabase.from("mesas").select("id, numero").eq("empresa_id", membro.empresa_id).eq("ativo", true).order("numero"),
      supabase.from("comandas").select("id, mesa_id, total").eq("empresa_id", membro.empresa_id).eq("status", "aberta"),
    ]).then(([m, c]) => {
      if (m.error || c.error) return toast.erro((m.error ?? c.error)!.message);
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

  const ocupadas = comandas.length;

  return (
    <main className="mx-auto w-full max-w-2xl pb-6">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-(--background) px-4 py-2 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">Mesas</h1>
          <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{membro.nome}</p>
        </div>
        <button onClick={recarregar} aria-label="Atualizar" className={iconeBtn}><RefreshCw className="size-5" /></button>
        <button onClick={sair} aria-label="Sair" className={iconeBtn}><LogOut className="size-5" /></button>
      </header>

      <div className="flex gap-4 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-emerald-500" /> Livre</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-full bg-rose-600" /> Ocupada ({ocupadas})</span>
      </div>

      {mesas === null ? (
        <div className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4">
          {Array.from({ length: 9 }, (_, n) => <div key={n} className="aspect-square animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />)}
        </div>
      ) : mesas.length === 0 ? (
        <p className="px-4 text-neutral-500">Nenhuma mesa cadastrada.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3 px-4 sm:grid-cols-4">
          {mesas.map((m) => {
            const c = comandas.find((x) => x.mesa_id === m.id);
            return (
              <li key={m.id}>
                <button onClick={() => setMesa(m)} aria-label={`Mesa ${m.numero}, ${c ? `ocupada, ${brl(c.total)}` : "livre"}`}
                  className={`flex aspect-square w-full flex-col items-center justify-center rounded-2xl border-2 transition active:scale-95 ${
                    c ? "border-rose-600 bg-rose-600 text-white"
                      : "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"}`}>
                  <span className="text-4xl font-bold">{m.numero}</span>
                  <span className="text-sm font-medium">{c ? brl(c.total) : "livre"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
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
        if (error) return toast.erro(error.message);
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
    <main className="mx-auto w-full max-w-2xl pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-neutral-200 bg-(--background) px-2 py-2 dark:border-neutral-800">
        <button onClick={voltar} aria-label="Voltar para mesas" className={iconeBtn}><ChevronLeft className="size-7" /></button>
        <h1 className="text-2xl font-bold">Mesa {mesa.numero}</h1>
        {comanda && <span className="ml-auto pr-3 text-xl font-bold">{brl(comanda.total)}</span>}
      </header>

      {comanda ? (
        <ul className="divide-y divide-neutral-200 px-4 dark:divide-neutral-800">
          {itens.map((i) => {
            const cancelado = i.pedidos.status === "cancelado";
            return (
              <li key={i.id} className={`flex justify-between gap-3 py-3 ${cancelado ? "opacity-50" : ""}`}>
                <div className="min-w-0">
                  <p className={`text-lg ${cancelado ? "line-through" : ""}`}>{i.quantidade}x {i.nome}</p>
                  {i.observacao && <p className="font-medium text-rose-700 dark:text-rose-400">» {i.observacao}</p>}
                  <p className="text-xs text-neutral-500">Pedido #{i.pedidos.numero} · {STATUS[i.pedidos.status]}</p>
                </div>
                <span className="shrink-0">{brl(i.preco * i.quantidade)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="p-6 text-center text-neutral-500 dark:text-neutral-400">
          Mesa livre. A comanda abre no primeiro pedido.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 bg-(--background) p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <button onClick={() => setAdicionando(true)}
          className="mx-auto flex h-16 w-full max-w-2xl items-center justify-center gap-2 rounded-2xl bg-rose-600 text-xl font-semibold text-white active:bg-rose-700">
          <Plus className="size-6" /> Adicionar itens
        </button>
      </div>
    </main>
  );
}
