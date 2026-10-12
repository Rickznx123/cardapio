"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bike, ChefHat, CircleCheck, CircleX, MessageCircle, PackageCheck, Receipt, Store } from "lucide-react";
import { varsCor } from "@/lib/cor";
import { createClient } from "@/lib/supabase/client";
import { brl, type PedidoPublico, STATUS } from "@/lib/tipos";

const supabase = createClient();
const ETAPAS = [
  { s: "novo", Icone: Receipt },
  { s: "preparo", Icone: ChefHat },
  { s: "pronto", Icone: PackageCheck },
  { s: "entregue", Icone: CircleCheck },
] as const;

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

type Empresa = { nome: string; whatsapp: string | null; cor_primaria: string | null };

export function Pedido() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const [p, setP] = useState<PedidoPublico | null>();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  useEffect(() => {
    supabase.from("empresas").select("nome, whatsapp, cor_primaria").eq("slug", slug).maybeSingle()
      .then(({ data }) => setEmpresa(data));
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

  const casca = (filhos: React.ReactNode) => (
    <div style={varsCor(empresa?.cor_primaria ?? null)} className="min-h-dvh flex-1 bg-neutral-50 px-4 py-6 text-neutral-900">
      <main className="mx-auto w-full max-w-md space-y-4">{filhos}</main>
    </div>
  );

  if (p === undefined) {
    return casca(<div className="h-64 animate-pulse rounded-3xl bg-neutral-200" aria-label="Carregando" />);
  }
  if (p === null) {
    return casca(
      <div className="space-y-3 rounded-3xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">Pedido não encontrado</h1>
        <Link href={`/${slug}`} className="inline-block font-medium text-(--cor) underline">Voltar ao cardápio</Link>
      </div>,
    );
  }

  const etapa = ETAPAS.findIndex((e) => e.s === p.status);
  const cancelado = p.status === "cancelado";

  return casca(
    <>
      <section className="rounded-3xl bg-white p-6 text-center shadow-sm">
        {cancelado ? (
          <CircleX className="mx-auto size-16 text-red-600" />
        ) : (
          <CircleCheck className="mx-auto size-16 text-emerald-600" />
        )}
        <p className="mt-2 text-sm text-neutral-500">{empresa?.nome}</p>
        <h1 className="text-3xl font-bold">Pedido #{p.numero}</h1>
        <p className="mt-1 flex items-center justify-center gap-1 text-sm text-neutral-600">
          {p.tipo === "entrega" ? <Bike className="size-4" /> : <Store className="size-4" />}
          {p.tipo === "entrega" ? `Entrega · ${p.bairro_nome}` : "Retirada no local"}
        </p>

        {cancelado ? (
          <p className="mt-4 rounded-xl bg-red-50 p-3 font-semibold text-red-700">Pedido cancelado. Fale com o estabelecimento.</p>
        ) : (
          <ol className="mt-6 grid grid-cols-4 gap-1" aria-label="Andamento do pedido">
            {ETAPAS.map(({ s, Icone }, n) => (
              <li key={s} aria-current={n === etapa ? "step" : undefined} className="flex flex-col items-center gap-1">
                <span className={`flex size-11 items-center justify-center rounded-full ${
                  n < etapa ? "bg-(--cor)/15 text-(--cor)" : n === etapa ? "bg-(--cor) text-(--cor-texto) ring-4 ring-(--cor)/20" : "bg-neutral-100 text-neutral-400"}`}>
                  <Icone className="size-5" />
                </span>
                <span className={`text-xs ${n <= etapa ? "font-semibold" : "text-neutral-400"}`}>{STATUS[s]}</span>
              </li>
            ))}
          </ol>
        )}
        {!cancelado && p.status !== "entregue" && (
          <p className="mt-4 text-xs text-neutral-400">Esta página se atualiza sozinha.</p>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <ul className="space-y-2">
          {p.itens.map((i, n) => (
            <li key={n}>
              <div className="flex justify-between gap-2"><span>{i.quantidade}x {i.nome}</span><span>{brl(i.preco * i.quantidade)}</span></div>
              {i.observacao && <p className="text-sm text-neutral-500">» {i.observacao}</p>}
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-neutral-200 pt-3 text-neutral-600">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{brl(p.subtotal)}</dd></div>
          {p.tipo === "entrega" && <div className="flex justify-between"><dt>Entrega</dt><dd>{brl(p.taxa)}</dd></div>}
          <div className="flex justify-between text-lg font-bold text-neutral-900"><dt>Total</dt><dd>{brl(p.total)}</dd></div>
        </dl>
      </section>

      {empresa?.whatsapp && (
        <a href={`https://wa.me/${empresa.whatsapp}?text=${encodeURIComponent(mensagemWhatsApp(p, empresa.nome))}`}
          target="_blank" rel="noopener noreferrer"
          className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-lg font-semibold text-white shadow-sm">
          <MessageCircle className="size-6" /> Enviar no WhatsApp
        </a>
      )}

      <Link href={`/${slug}`} className="block text-center text-sm font-medium text-neutral-600 underline">Voltar ao cardápio</Link>
    </>,
  );
}
