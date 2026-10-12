"use client";

import { useEffect, useState } from "react";
import { Clock, Lock, Receipt } from "lucide-react";
import { Modal } from "@/components/modal";
import { EscolhaPagamento } from "@/components/pagamento";
import { toast } from "@/components/toast";
import { type ConfigImpressao, preConta, type PedidoBalcao, SELECT_PEDIDO } from "@/lib/cupom";
import { imprimir } from "@/lib/impressao";
import { createClient } from "@/lib/supabase/client";
import { brl, type FormaPagamento } from "@/lib/tipos";
import { AbrirCaixa, useCaixaAberto } from "./caixa-aberto";

const supabase = createClient();

type Comanda = { id: string; total: number; aberta_em: string; mesas: { numero: number } };

// Comandas abertas: imprimir conta (pré-conta) e fechar com forma de pagamento. `versao` muda quando chega pedido de mesa.
export function Comandas({ empresaId, empresaNome, versao, formas, config }: {
  empresaId: string; empresaNome: string; versao: number; formas: FormaPagamento[]; config: ConfigImpressao | null;
}) {
  const [comandas, setComandas] = useState<Comanda[] | null>(null);
  const [local, setLocal] = useState(0);
  const [fechando, setFechando] = useState<Comanda | null>(null);

  useEffect(() => {
    supabase.from("comandas").select("id, total, aberta_em, mesas(numero)")
      .eq("empresa_id", empresaId).eq("status", "aberta").order("aberta_em")
      .then(({ data, error }) => (error ? toast.erro(error.message) : setComandas(data as unknown as Comanda[])));
  }, [empresaId, versao, local]);

  async function imprimirConta(c: Comanda) {
    const { data, error } = await supabase.from("pedidos").select(SELECT_PEDIDO)
      .eq("comanda_id", c.id).order("created_at");
    if (error) return toast.erro(error.message);
    imprimir(preConta(empresaNome, c.mesas.numero, data as unknown as PedidoBalcao[], config));
    toast.ok(`Imprimindo conta da mesa ${c.mesas.numero}`);
  }

  if (comandas === null) return null;
  if (!comandas.length) {
    return <p className="rounded-xl bg-neutral-100 p-4 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">Nenhuma comanda aberta.</p>;
  }

  return (
    <section aria-label="Comandas abertas">
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase">Comandas abertas</h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {comandas.map((c) => (
          <li key={c.id} className="rounded-xl border-t-4 border-sky-700 bg-white p-4 shadow-sm dark:bg-neutral-900">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-black">Mesa {c.mesas.numero}</span>
              <span className="text-xl font-bold tabular-nums">{brl(c.total)}</span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              <Clock className="size-3.5" /> Aberta às {new Date(c.aberta_em).toLocaleTimeString("pt-BR", { timeStyle: "short" })}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => imprimirConta(c)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 text-sm font-semibold dark:border-neutral-700">
                <Receipt className="size-4" /> Imprimir conta
              </button>
              <button onClick={() => setFechando(c)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
                <Lock className="size-4" /> Fechar
              </button>
            </div>
          </li>
        ))}
      </ul>
      {fechando && (
        <FecharModal comanda={fechando} empresaId={empresaId} formas={formas} fechar={() => setFechando(null)}
          fechada={() => { setFechando(null); setLocal((v) => v + 1); }} />
      )}
    </section>
  );
}

function FecharModal({ comanda, empresaId, formas, fechar, fechada }: {
  comanda: Comanda; empresaId: string; formas: FormaPagamento[]; fechar: () => void; fechada: () => void;
}) {
  const [caixa, recarregarCaixa] = useCaixaAberto(empresaId);
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    const { error } = await supabase.rpc("fechar_comanda", { p_comanda_id: comanda.id, p_forma_pagamento: forma });
    setSalvando(false);
    if (error) return toast.erro(error.message);
    toast.ok(`Mesa ${comanda.mesas.numero} fechada`);
    fechada();
  }

  return (
    <Modal titulo={`Fechar mesa ${comanda.mesas.numero}`} fechar={fechar}
      rodape={
        <button disabled={!forma || !caixa || salvando} onClick={confirmar}
          className="h-12 w-full rounded-lg bg-emerald-600 font-semibold text-white disabled:opacity-50">
          {salvando ? "Fechando…" : `Receber ${brl(comanda.total)} e fechar`}
        </button>
      }>
      <div className="space-y-4 p-5">
        <p className="text-center text-3xl font-bold tabular-nums">{brl(comanda.total)}</p>
        {caixa === null && <AbrirCaixa empresaId={empresaId} aberto={recarregarCaixa} compacto />}
        <EscolhaPagamento formas={formas} valor={forma} mudar={setForma} />
        <p className="text-sm text-neutral-500">Os pedidos da mesa ficam marcados como pagos com essa forma.</p>
      </div>
    </Modal>
  );
}
