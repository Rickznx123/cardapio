"use client";

import { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export type CaixaAberto = { id: string; aberto_em: string; valor_inicial: number };

// Caixa aberto da empresa: undefined = carregando, null = nenhum.
export function useCaixaAberto(empresaId: string) {
  const [caixa, setCaixa] = useState<CaixaAberto | null>();
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    supabase.from("caixas").select("id, aberto_em, valor_inicial").eq("empresa_id", empresaId).eq("status", "aberto").maybeSingle()
      .then(({ data, error }) => (error ? toast.erro(error.message) : setCaixa(data)));
  }, [empresaId, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return [caixa, recarregar] as const;
}

export async function abrirCaixa(empresaId: string, valorInicial: number) {
  const { error } = await supabase.rpc("abrir_caixa", { p_empresa_id: empresaId, p_valor_inicial: valorInicial });
  if (error) { toast.erro(error.message); return false; }
  toast.ok("Caixa aberto");
  return true;
}

// Formulário de abertura (valor inicial em dinheiro). `compacto`: versão de aviso dentro do Pagar/Fechar mesa.
export function AbrirCaixa({ empresaId, aberto, compacto = false }: { empresaId: string; aberto: () => void; compacto?: boolean }) {
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function abrir() {
    const n = Number(valor.replace(",", ".") || "0");
    if (Number.isNaN(n) || n < 0) return toast.erro("Valor inicial inválido");
    setEnviando(true);
    if (await abrirCaixa(empresaId, n)) aberto();
    setEnviando(false);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); abrir(); }}
      className={compacto ? "space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" : "space-y-3"}>
      {compacto && <p className="text-sm font-semibold">Nenhum caixa aberto. Abra o caixa para registrar o recebimento.</p>}
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-sm font-medium">Valor inicial em dinheiro (troco)</span>
          <input value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" placeholder="0,00"
            className="h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base dark:border-neutral-700 dark:bg-neutral-950" />
        </label>
        <button disabled={enviando}
          className="mt-6 flex h-11 shrink-0 items-center gap-2 rounded-lg bg-rose-600 px-4 font-semibold text-white disabled:opacity-50">
          <Wallet className="size-4" /> {enviando ? "Abrindo…" : "Abrir caixa"}
        </button>
      </div>
    </form>
  );
}
