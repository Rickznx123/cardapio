"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, Search } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import { type ConfigImpressao, cuponsPedido, ORIGEM, type PedidoBalcao, SELECT_PEDIDO } from "@/lib/cupom";
import { diaOperacional, inicioDiaOperacional, somaDias } from "@/lib/horarios";
import { imprimir } from "@/lib/impressao";
import { createClient } from "@/lib/supabase/client";
import { brl, FORMAS, STATUS, type StatusPedido, TODAS_FORMAS } from "@/lib/tipos";
import { DetalhePedido } from "../detalhe-pedido";
import { card } from "../ui";

const supabase = createClient();
const POR_PAGINA = 25;
const TIPOS = { retirada: "Balcão", entrega: "Delivery", mesa: "Mesa" } as const;
const sel = "h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

type Filtros = { de: string; ate: string; status: string; tipo: string; origem: string; forma: string; pago: string; busca: string };

// Datas do filtro são dias de trabalho: começam às `virada` (ex.: 05:00) no fuso da loja, como no Relatório.
export function Historico({ empresaId, empresaNome, config, virada }: {
  empresaId: string; empresaNome: string; config: ConfigImpressao | null; virada: string;
}) {
  const [filtros, setFiltros] = useState<Filtros>(() => ({ de: diaOperacional(new Date(), virada), ate: diaOperacional(new Date(), virada), status: "", tipo: "", origem: "", forma: "", pago: "", busca: "" }));
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [dados, setDados] = useState<{ lista: PedidoBalcao[]; total: number } | null>(null);
  const [aberto, setAberto] = useState<PedidoBalcao | null>(null);

  const mudar = (campos: Partial<Filtros>) => { setFiltros((f) => ({ ...f, ...campos })); setPagina(0); };

  useEffect(() => {
    let q = supabase.from("pedidos").select(SELECT_PEDIDO, { count: "exact" }).eq("empresa_id", empresaId);
    if (filtros.de) q = q.gte("created_at", inicioDiaOperacional(filtros.de, virada).toISOString());
    if (filtros.ate) q = q.lt("created_at", inicioDiaOperacional(somaDias(filtros.ate, 1), virada).toISOString());
    if (filtros.status) q = q.eq("status", filtros.status);
    if (filtros.tipo) q = q.eq("tipo", filtros.tipo);
    if (filtros.origem) q = q.eq("origem", filtros.origem);
    if (filtros.forma === "a_definir") q = q.is("forma_pagamento", null);
    else if (filtros.forma) q = q.eq("forma_pagamento", filtros.forma);
    if (filtros.pago) q = q.eq("pago", filtros.pago === "sim");
    const termo = filtros.busca.trim().replace(/^#/, "");
    if (/^\d+$/.test(termo)) q = q.eq("numero", Number(termo));
    else if (termo) q = q.ilike("cliente_nome", `%${termo.replace(/[%_]/g, "")}%`);
    q.order("created_at", { ascending: false }).range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1)
      .then(({ data, count, error }) => (error ? toast.erro(error.message) : setDados({ lista: data as unknown as PedidoBalcao[], total: count ?? 0 })));
  }, [empresaId, filtros, pagina, virada]);

  const ultima = dados ? Math.max(0, Math.ceil(dados.total / POR_PAGINA) - 1) : 0;

  return (
    <div className="space-y-4">
      <form className={`${card} flex flex-wrap items-end gap-3`} onSubmit={(e) => { e.preventDefault(); mudar({ busca }); }}>
        <label className="text-sm"><span className="mb-1 block font-medium">De</span>
          <input type="date" value={filtros.de} max={filtros.ate || undefined} onChange={(e) => mudar({ de: e.target.value })} className={sel} />
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Até</span>
          <input type="date" value={filtros.ate} min={filtros.de || undefined} onChange={(e) => mudar({ ate: e.target.value })} className={sel} />
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Status</span>
          <select value={filtros.status} onChange={(e) => mudar({ status: e.target.value })} className={sel}>
            <option value="">Todos</option>
            {(Object.keys(STATUS) as StatusPedido[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Tipo</span>
          <select value={filtros.tipo} onChange={(e) => mudar({ tipo: e.target.value })} className={sel}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Origem</span>
          <select value={filtros.origem} onChange={(e) => mudar({ origem: e.target.value })} className={sel}>
            <option value="">Todas</option>
            {Object.entries(ORIGEM).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Pagamento</span>
          <select value={filtros.forma} onChange={(e) => mudar({ forma: e.target.value })} className={sel}>
            <option value="">Todas</option>
            {TODAS_FORMAS.map((f) => <option key={f} value={f}>{FORMAS[f]}</option>)}
            <option value="a_definir">A definir</option>
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Pago</span>
          <select value={filtros.pago} onChange={(e) => mudar({ pago: e.target.value })} className={sel}>
            <option value="">Todos</option><option value="sim">Pago</option><option value="nao">Não pago</option>
          </select>
        </label>
        <label className="relative min-w-48 flex-1 text-sm"><span className="mb-1 block font-medium">Buscar</span>
          <Search className="pointer-events-none absolute bottom-3 left-3 size-4 text-neutral-400" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} onBlur={() => busca !== filtros.busca && mudar({ busca })}
            placeholder="Nº do pedido ou cliente" className={`${sel} w-full pl-9`} />
        </label>
      </form>

      <section className={`${card} overflow-x-auto p-0`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              {["Nº", "Data", "Tipo", "Origem", "Cliente", "Status", "Pagamento", "Total"].map((h, n) => (
                <th key={h} className={`px-3 py-2 font-medium ${n === 7 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {dados === null ? (
              <tr><td colSpan={8} className="p-6 text-center text-neutral-500">Carregando…</td></tr>
            ) : dados.lista.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-neutral-500">Nenhum pedido com esses filtros.</td></tr>
            ) : dados.lista.map((p) => (
              <tr key={p.id} onClick={() => setAberto(p)} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
                <td className="px-3 py-2">
                  <button onClick={(e) => { e.stopPropagation(); setAberto(p); }} className="font-bold tabular-nums hover:underline">#{p.numero}</button>
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{new Date(p.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-3 py-2">{p.tipo === "mesa" ? `Mesa ${p.comandas?.mesas?.numero ?? "?"}` : TIPOS[p.tipo]}</td>
                <td className="px-3 py-2 text-xs font-semibold">{ORIGEM[p.origem]}</td>
                <td className="max-w-40 truncate px-3 py-2">{p.cliente_nome ?? p.membros?.nome ?? "—"}</td>
                <td className={`px-3 py-2 ${p.status === "cancelado" ? "text-red-600" : ""}`}>{STATUS[p.status]}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {p.forma_pagamento ? FORMAS[p.forma_pagamento] : "A definir"}
                  <span className={`ml-1.5 rounded px-1.5 py-0.5 text-xs font-bold ${p.pago ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>
                    {p.pago ? "Pago" : "Não pago"}
                  </span>
                </td>
                <td className={`px-3 py-2 text-right font-semibold tabular-nums ${p.status === "cancelado" ? "line-through opacity-60" : ""}`}>{brl(p.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {dados && dados.total > 0 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          <span className="text-neutral-500">{pagina * POR_PAGINA + 1}–{Math.min(dados.total, (pagina + 1) * POR_PAGINA)} de {dados.total}</span>
          <span className="flex gap-2">
            <button disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)} aria-label="Página anterior"
              className="flex size-10 items-center justify-center rounded-lg border border-neutral-300 disabled:opacity-40 dark:border-neutral-700"><ChevronLeft className="size-5" /></button>
            <button disabled={pagina >= ultima} onClick={() => setPagina((p) => p + 1)} aria-label="Próxima página"
              className="flex size-10 items-center justify-center rounded-lg border border-neutral-300 disabled:opacity-40 dark:border-neutral-700"><ChevronRight className="size-5" /></button>
          </span>
        </nav>
      )}

      {aberto && (
        <Drawer titulo={`Pedido #${aberto.numero}`} fechar={() => setAberto(null)}
          rodape={<button onClick={() => { cuponsPedido(empresaNome, aberto, config).forEach((h) => imprimir(h)); toast.ok(`Imprimindo #${aberto.numero}`); }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 font-semibold dark:border-neutral-700">
            <Printer className="size-5" /> Reimprimir</button>}>
          <DetalhePedido p={aberto} />
        </Drawer>
      )}
    </div>
  );
}
