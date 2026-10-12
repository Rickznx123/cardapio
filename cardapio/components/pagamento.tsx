"use client";

import { Banknote, CreditCard, QrCode } from "lucide-react";
import { brl, FORMAS, type FormaPagamento, TODAS_FORMAS } from "@/lib/tipos";

const ICONES: Record<FormaPagamento, typeof Banknote> = {
  dinheiro: Banknote, pix: QrCode, cartao_credito: CreditCard, cartao_debito: CreditCard,
};

// Destaque usa --cor (cor da loja no cardápio; rosa nas áreas da equipe).
// `formas`: só as aceitas pela loja (empresas.formas_pagamento); padrão = todas.
export function EscolhaPagamento({ valor, mudar, formas = TODAS_FORMAS }: {
  valor: FormaPagamento | null; mudar: (f: FormaPagamento) => void; formas?: readonly FormaPagamento[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pagamento">
      {TODAS_FORMAS.filter((f) => formas.includes(f)).map((f) => {
        const Icone = ICONES[f];
        return (
          <button key={f} type="button" role="radio" aria-checked={valor === f} onClick={() => mudar(f)}
            className={`flex min-h-14 items-center gap-2 rounded-xl border-2 px-3 text-left text-sm font-semibold ${
              valor === f ? "border-(--cor) bg-(--cor)/10" : "border-neutral-200 dark:border-neutral-700"}`}>
            <Icone className="size-5 shrink-0" /> {FORMAS[f]}
          </button>
        );
      })}
    </div>
  );
}

// "Precisa de troco? Para quanto?" — valor em texto ("50" ou "50,00"); vazio = sem troco.
export function CampoTroco({ total, valor, mudar }: { total: number; valor: string | null; mudar: (v: string | null) => void }) {
  const numero = valor ? Number(valor.replace(",", ".")) : 0;
  const invalido = valor !== null && valor !== "" && !(numero >= total);
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={valor !== null} onChange={(e) => mudar(e.target.checked ? "" : null)}
          className="size-5 accent-(--cor)" />
        Precisa de troco?
      </label>
      {valor !== null && (
        <label className="block">
          <span className="mb-1 block text-sm">Troco para quanto?</span>
          <input value={valor} onChange={(e) => mudar(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal"
            placeholder="Ex.: 100,00" required aria-invalid={invalido}
            className="h-12 w-full rounded-xl border border-neutral-300 bg-transparent px-4 text-base dark:border-neutral-700" />
          {invalido && <span className="mt-1 block text-sm text-red-600">Precisa ser pelo menos {brl(total)}.</span>}
        </label>
      )}
    </div>
  );
}

// Converte o texto do troco para número (ou null). Use antes de enviar.
export const trocoNumero = (v: string | null) => (v ? Number(v.replace(",", ".")) || null : null);
export const trocoInvalido = (v: string | null, total: number) => v !== null && !(Number((v || "0").replace(",", ".")) >= total);
