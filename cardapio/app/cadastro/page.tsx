import type { Metadata } from "next";
import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";
import { PRODUTO } from "@/lib/marca";
import { DIAS_TRIAL } from "@/lib/planos";
import { FormCadastro } from "./form";

export const metadata: Metadata = {
  title: `Teste grátis por ${DIAS_TRIAL} dias · ${PRODUTO}`,
  description: "Crie o cardápio digital da sua loja em minutos. Sem cartão de crédito.",
};

export default function Cadastro() {
  return (
    <main className="flex flex-1 flex-col items-center bg-neutral-50 px-4 py-8 text-neutral-900">
      <Link href="/" className="mb-6 flex items-center gap-2 font-bold text-rose-600">
        <UtensilsCrossed className="size-6" /> {PRODUTO}
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Comece seu teste grátis</h1>
        <p className="mt-1 text-neutral-600">{DIAS_TRIAL} dias com tudo liberado. Sem cartão de crédito.</p>
        <FormCadastro siteKey={process.env.TURNSTILE_SITE_KEY ?? null} />
      </div>
      <p className="mt-4 text-sm text-neutral-600">
        Já tem conta? <Link href="/login" className="font-semibold text-rose-700">Entrar</Link>
      </p>
    </main>
  );
}
