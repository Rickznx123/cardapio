"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleDashed, Sparkles } from "lucide-react";
import { Modal } from "@/components/modal";
import { temHorarios } from "@/lib/horarios";
import { PRODUTO } from "@/lib/marca";
import { CONFIGURACAO_INCLUSA, INCLUI, PRECO_MENSAL } from "@/lib/planos";
import { brl } from "@/lib/tipos";
import { PagarAssinatura } from "./assinatura";
import type { Empresa } from "./configuracoes";
import { supabase } from "./ui";

function Preco() {
  return (
    <div className="text-center">
      <p><span className="text-4xl font-black tabular-nums">{brl(PRECO_MENSAL)}</span><span className="text-neutral-500">/mês</span></p>
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Sem taxa por pedido. Sem fidelidade.</p>
    </div>
  );
}

export function FaixaTrial({ dias, assinar }: { dias: number; assinar: () => void }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <Sparkles className="size-4 shrink-0" />
      <span>Teste grátis: <b>{dias} {dias === 1 ? "dia restante" : "dias restantes"}</b></span>
      <span aria-hidden>·</span>
      <button onClick={assinar} className="font-bold underline underline-offset-2">Assinar</button>
    </div>
  );
}

export function Assinar({ empresa, fechar }: { empresa: Empresa; fechar: () => void }) {
  return (
    <Modal titulo={`Assinar o ${PRODUTO}`} fechar={fechar}>
      <div className="space-y-4 p-5">
        <Preco />
        <ul className="space-y-1.5 text-sm">
          {INCLUI.map((i) => <li key={i} className="flex gap-2"><CircleCheck className="size-4 shrink-0 text-emerald-600" /> {i}</li>)}
        </ul>
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{CONFIGURACAO_INCLUSA}.</p>
        <PagarAssinatura empresa={empresa} />
      </div>
    </Modal>
  );
}

export function TesteEncerrado({ empresa, sair }: { empresa: Empresa; sair: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-bold">{empresa.plano_status === "trial" ? "Seu teste grátis terminou" : "Sua assinatura venceu"}</h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          O cardápio de <b>{empresa.nome}</b> está indisponível para os clientes. Pague para voltar a receber pedidos;
          tudo o que você configurou continua salvo.
        </p>
        <Preco />
        <PagarAssinatura empresa={empresa} />
        <button onClick={sair} className="text-sm text-neutral-500 underline">Sair</button>
      </div>
    </main>
  );
}

// "Completar 3/5" no topo até a loja estar pronta.
export function Checklist({ empresa }: { empresa: Empresa }) {
  const [contagem, setContagem] = useState<{ itens: number; bairros: number } | null>(null);

  useEffect(() => {
    const contar = (tabela: string) =>
      supabase.from(tabela).select("id", { count: "exact", head: true }).eq("empresa_id", empresa.id).then((r) => r.count ?? 0);
    Promise.all([contar("itens"), contar("bairros")]).then(([itens, bairros]) => setContagem({ itens, bairros }));
  }, [empresa.id]);

  if (!contagem) return null;
  const passos = [
    { nome: "Logo", feito: !!empresa.logo_url },
    { nome: "WhatsApp da loja", feito: !!empresa.whatsapp },
    { nome: "3 itens no cardápio", feito: contagem.itens >= 3 },
    { nome: "Bairros de entrega", feito: !empresa.aceita_entrega || contagem.bairros > 0 },
    { nome: "Horários", feito: temHorarios(empresa.horarios) },
  ];
  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 bg-white px-4 py-3 lg:px-6 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-40 flex-1">
        <p className="text-sm font-semibold">Complete sua loja · {feitos}/{passos.length}</p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" role="progressbar"
          aria-valuemin={0} aria-valuemax={passos.length} aria-valuenow={feitos} aria-label="Configuração da loja">
          <div className="h-full rounded-full bg-rose-600" style={{ width: `${(feitos / passos.length) * 100}%` }} />
        </div>
      </div>
      <ul className="hidden flex-wrap gap-x-3 gap-y-1 text-xs md:flex">
        {passos.map((p) => (
          <li key={p.nome} className={`flex items-center gap-1 ${p.feito ? "text-neutral-400 line-through" : ""}`}>
            {p.feito ? <CircleCheck className="size-3.5 text-emerald-600" /> : <CircleDashed className="size-3.5" />} {p.nome}
          </li>
        ))}
      </ul>
      <Link href="/painel/comecar" className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700">
        Completar
      </Link>
    </div>
  );
}
