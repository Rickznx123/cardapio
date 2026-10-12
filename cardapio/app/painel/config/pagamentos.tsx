"use client";

import { Banknote, CreditCard, QrCode } from "lucide-react";
import { toast } from "@/components/toast";
import { FORMAS, type FormaPagamento, TODAS_FORMAS } from "@/lib/tipos";
import type { Empresa } from "../configuracoes";
import { card, supabase } from "../ui";

const ICONES: Record<FormaPagamento, typeof Banknote> = { dinheiro: Banknote, pix: QrCode, cartao_credito: CreditCard, cartao_debito: CreditCard };

// Configurações ▸ Métodos de pagamento. O banco exige pelo menos 1 e recusa pedido com forma desligada.
export function Pagamentos({ empresa, mudou }: { empresa: Empresa; mudou: (e: Empresa) => void }) {
  const ativas = empresa.formas_pagamento ?? TODAS_FORMAS;

  async function alternar(f: FormaPagamento) {
    const novas = ativas.includes(f) ? ativas.filter((x) => x !== f) : TODAS_FORMAS.filter((x) => x === f || ativas.includes(x));
    if (!novas.length) return toast.erro("Deixe pelo menos uma forma de pagamento ativa");
    mudou({ ...empresa, formas_pagamento: novas });
    const { error } = await supabase.from("empresas").update({ formas_pagamento: novas }).eq("id", empresa.id);
    if (error) {
      mudou({ ...empresa, formas_pagamento: ativas });
      return toast.erro(error.message);
    }
    toast.salvo();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Só as formas ligadas aparecem no checkout do cardápio, em &quot;Informações&quot; e no painel.
      </p>
      <ul className={`${card} divide-y divide-neutral-200 p-0 dark:divide-neutral-800`}>
        {TODAS_FORMAS.map((f) => {
          const Icone = ICONES[f];
          const ligada = ativas.includes(f);
          return (
            <li key={f}>
              <label className="flex cursor-pointer items-center gap-3 p-4">
                <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800"><Icone className="size-5" /></span>
                <span className="flex-1 font-medium">{FORMAS[f]}</span>
                <input type="checkbox" role="switch" checked={ligada} onChange={() => alternar(f)} aria-label={FORMAS[f]}
                  className="size-5 accent-rose-600" />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
