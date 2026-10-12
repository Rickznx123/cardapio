"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { brl, type PedidoPublico, STATUS } from "@/lib/tipos";

const supabase = createClient();
const ETAPAS = ["novo", "preparo", "pronto", "entregue"] as const;

function mensagemWhatsApp(p: PedidoPublico, empresa: string) {
  return [
    `*Pedido #${p.numero}* — ${empresa}`,
    "",
    ...p.itens.flatMap((i) => [
      `${i.quantidade}x ${i.nome} — ${brl(i.preco * i.quantidade)}`,
      ...(i.observacao ? [`   _${i.observacao}_`] : []),
    ]),
    "",
    `Subtotal: ${brl(p.subtotal)}`,
    ...(p.tipo === "entrega" ? [`Entrega (${p.bairro_nome}): ${brl(p.taxa)}`] : []),
    `*Total: ${brl(p.total)}*`,
    p.tipo === "entrega" ? "Para entrega" : "Vou retirar no local",
  ].join("\n");
}

export function Pedido() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const [p, setP] = useState<PedidoPublico | null>();
  const [empresa, setEmpresa] = useState<{ nome: string; whatsapp: string | null } | null>(null);

  useEffect(() => {
    supabase.from("empresas").select("nome, whatsapp").eq("slug", slug).maybeSingle().then(({ data }) => setEmpresa(data));
  }, [slug]);

  // Atualiza o status a cada 20s até o pedido terminar (anon não tem Realtime em pedidos).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const buscar = () =>
      supabase.rpc("ver_pedido_publico", { p_slug: slug, p_id: id }).then(({ data, error }) => {
        const ped = error ? null : (data as PedidoPublico | null);
        setP(ped);
        if (ped && ped.status !== "entregue" && ped.status !== "cancelado") timer = setTimeout(buscar, 20_000);
      });
    buscar();
    return () => clearTimeout(timer);
  }, [slug, id]);

  if (p === undefined) return <p className="p-4">Carregando…</p>;
  if (p === null) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-4 text-center">
        <h1 className="text-xl font-bold">Pedido não encontrado</h1>
        <Link href={`/${slug}`} className="underline">Voltar ao cardápio</Link>
      </main>
    );
  }

  const etapa = ETAPAS.indexOf(p.status as (typeof ETAPAS)[number]);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4 text-center">
      <p className="text-5xl">{p.status === "cancelado" ? "❌" : "✅"}</p>
      <h1 className="text-2xl font-bold">Pedido #{p.numero}</h1>

      {p.status === "cancelado" ? (
        <p className="font-semibold text-red-600">Pedido cancelado. Fale com o estabelecimento.</p>
      ) : (
        <ol className="flex justify-between text-xs" aria-label="Andamento do pedido">
          {ETAPAS.map((s, n) => (
            <li key={s} aria-current={n === etapa ? "step" : undefined}
              className={`flex-1 border-t-4 pt-1 ${n <= etapa ? "border-green-600 font-semibold" : "border-gray-200 text-gray-400"}`}>
              {STATUS[s]}
            </li>
          ))}
        </ol>
      )}

      <ul className="space-y-1 rounded border p-3 text-left">
        {p.itens.map((i, n) => (
          <li key={n}>
            <div className="flex justify-between gap-2">
              <span>{i.quantidade}x {i.nome}</span><span>{brl(i.preco * i.quantidade)}</span>
            </div>
            {i.observacao && <p className="text-sm text-gray-500">{i.observacao}</p>}
          </li>
        ))}
        {p.tipo === "entrega" && (
          <li className="flex justify-between border-t pt-1"><span>Entrega ({p.bairro_nome})</span><span>{brl(p.taxa)}</span></li>
        )}
        <li className="flex justify-between font-bold"><span>Total</span><span>{brl(p.total)}</span></li>
      </ul>

      {empresa?.whatsapp && (
        <a href={`https://wa.me/${empresa.whatsapp}?text=${encodeURIComponent(mensagemWhatsApp(p, empresa.nome))}`}
          target="_blank" rel="noopener noreferrer"
          className="block rounded-lg bg-green-600 p-4 font-semibold text-white">
          Enviar pedido no WhatsApp
        </a>
      )}

      <Link href={`/${slug}`} className="block text-sm underline">Voltar ao cardápio</Link>
    </main>
  );
}
