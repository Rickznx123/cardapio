"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "@/components/toast";
import { ORIGEM } from "@/lib/cupom";
import { createClient } from "@/lib/supabase/client";
import { brl, FORMAS, type FormaPagamento } from "@/lib/tipos";
import { card } from "../ui";

const supabase = createClient();

type Relatorio = {
  faturamento: number; pedidos: number; ticket_medio: number; cancelados: number; valor_cancelado: number;
  por_forma: { forma: FormaPagamento | "a_definir"; valor: number; pedidos: number }[];
  por_tipo: { tipo: "mesa" | "entrega" | "retirada"; valor: number; pedidos: number }[];
  por_origem: { origem: keyof typeof ORIGEM; valor: number; pedidos: number }[];
  top_produtos: { nome: string; quantidade: number; valor: number }[];
  por_hora: { hora: number; valor: number; pedidos: number }[];
  por_dia: { dia: string; valor: number; pedidos: number }[];
};

const PERIODOS = [["hoje", "Hoje"], ["ontem", "Ontem"], ["7", "7 dias"], ["30", "30 dias"], ["custom", "Personalizado"]] as const;
type Periodo = (typeof PERIODOS)[number][0];
const TIPOS = { retirada: "Balcão", entrega: "Delivery", mesa: "Mesa" };
const ROTULO_FORMA = (f: string) => (f === "a_definir" ? "A definir" : FORMAS[f as FormaPagamento]);

// Paleta categórica validada (dataviz: slots 1–4, claro/escuro); a cor segue a forma, nunca a posição.
const COR_FORMA: Record<string, string> = {
  dinheiro: "var(--c1)", pix: "var(--c2)", cartao_credito: "var(--c3)", cartao_debito: "var(--c4)", a_definir: "var(--c-outro)",
};
const VARS =
  "[--serie:#2a78d6] [--c1:#2a78d6] [--c2:#eb6834] [--c3:#1baf7a] [--c4:#eda100] [--c-outro:#a3a29c] [--grade:#e7e5e4] [--eixo:#898781] [--sup:#ffffff] " +
  "dark:[--serie:#3987e5] dark:[--c1:#3987e5] dark:[--c2:#d95926] dark:[--c3:#199e70] dark:[--c4:#c98500] dark:[--c-outro:#6b6a65] dark:[--grade:#383835] dark:[--sup:#171717]";

const iso = (d: Date) => d.toLocaleDateString("en-CA"); // AAAA-MM-DD local
const somaDias = (s: string, n: number) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const instante = (s: string) => new Date(`${s}T00:00:00`).toISOString();
const dataCurta = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const reais = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

function intervalo(p: Periodo, de: string, ate: string, hoje: string): [string, string] {
  if (p === "hoje") return [hoje, hoje];
  if (p === "ontem") return [somaDias(hoje, -1), somaDias(hoje, -1)];
  if (p === "7") return [somaDias(hoje, -6), hoje];
  if (p === "30") return [somaDias(hoje, -29), hoje];
  return [de, ate];
}

export function Relatorios({ empresaId }: { empresaId: string }) {
  const [hoje] = useState(() => iso(new Date()));
  const [periodo, setPeriodo] = useState<Periodo>("7");
  const [custom, setCustom] = useState(() => ({ de: somaDias(iso(new Date()), -6), ate: iso(new Date()) }));
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [de, ate] = intervalo(periodo, custom.de, custom.ate, hoje);

  useEffect(() => {
    if (!de || !ate || de > ate) return;
    supabase.rpc("relatorio_vendas", {
      p_empresa_id: empresaId, p_inicio: instante(de), p_fim: instante(somaDias(ate, 1)),
      p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).then(({ data, error }) => (error ? toast.erro(error.message) : setRel(data as Relatorio)));
  }, [empresaId, de, ate]);

  // Preenche dias/horas sem venda com zero (só apresentação; a soma vem do banco).
  const dias: { dia: string; rotulo: string; valor: number; pedidos: number }[] = [];
  if (rel) for (let d = de; d <= ate; d = somaDias(d, 1)) {
    const x = rel.por_dia.find((r) => r.dia === d);
    dias.push({ dia: d, rotulo: dataCurta(d), valor: Number(x?.valor ?? 0), pedidos: x?.pedidos ?? 0 });
  }
  const horas = Array.from({ length: 24 }, (_, h) => {
    const x = rel?.por_hora.find((r) => r.hora === h);
    return { hora: h, rotulo: `${String(h).padStart(2, "0")}h`, valor: Number(x?.valor ?? 0), pedidos: x?.pedidos ?? 0 };
  });
  const totalFormas = rel?.por_forma.reduce((s, f) => s + Number(f.valor), 0) ?? 0;

  function exportarCsv() {
    if (!rel) return;
    const n = (v: number) => Number(v).toFixed(2).replace(".", ",");
    const linhas: (string | number)[][] = [
      ["Relatório de vendas", `${dataCurta(de)} a ${dataCurta(ate)}`],
      [],
      ["Faturamento", n(rel.faturamento)], ["Pedidos", rel.pedidos], ["Ticket médio", n(rel.ticket_medio)],
      ["Cancelados", rel.cancelados], ["Valor cancelado", n(rel.valor_cancelado)],
      [], ["Forma de pagamento", "Pedidos", "Valor"], ...rel.por_forma.map((f) => [ROTULO_FORMA(f.forma), f.pedidos, n(f.valor)]),
      [], ["Tipo", "Pedidos", "Valor"], ...rel.por_tipo.map((t) => [TIPOS[t.tipo], t.pedidos, n(t.valor)]),
      [], ["Origem", "Pedidos", "Valor"], ...rel.por_origem.map((o) => [ORIGEM[o.origem], o.pedidos, n(o.valor)]),
      [], ["Produto", "Quantidade", "Valor"], ...rel.top_produtos.map((p) => [p.nome, p.quantidade, n(p.valor)]),
      [], ["Dia", "Pedidos", "Valor"], ...dias.map((d) => [d.dia, d.pedidos, n(d.valor)]),
      [], ["Hora", "Pedidos", "Valor"], ...horas.map((h) => [h.rotulo, h.pedidos, n(h.valor)]),
    ];
    // ; e vírgula decimal: abre direto no Excel em pt-BR. BOM para acentos.
    const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `relatorio-${de}-a-${ate}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const tooltip = {
    contentStyle: { background: "var(--sup)", border: "1px solid var(--grade)", borderRadius: 8, fontSize: 13 },
    cursor: { fill: "var(--grade)", opacity: 0.4 },
  };

  return (
    <div className={`space-y-4 ${VARS}`}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-neutral-200/70 p-1 dark:bg-neutral-800" role="radiogroup" aria-label="Período">
          {PERIODOS.map(([p, rotulo]) => (
            <button key={p} role="radio" aria-checked={p === periodo} onClick={() => setPeriodo(p)}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${p === periodo ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-600 dark:text-neutral-400"}`}>
              {rotulo}
            </button>
          ))}
        </div>
        {periodo === "custom" && (
          <>
            <input type="date" value={custom.de} max={custom.ate} onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value }))} aria-label="De"
              className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
            <input type="date" value={custom.ate} min={custom.de} onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value }))} aria-label="Até"
              className="h-10 rounded-lg border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" />
          </>
        )}
        <button onClick={exportarCsv} disabled={!rel}
          className="ml-auto flex h-10 items-center gap-2 rounded-lg border border-neutral-300 px-3 text-sm font-semibold disabled:opacity-50 dark:border-neutral-700">
          <Download className="size-4" /> Exportar CSV
        </button>
      </div>

      {!rel ? <div className="h-64 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi rotulo="Faturamento" valor={brl(rel.faturamento)} />
            <Kpi rotulo="Pedidos" valor={String(rel.pedidos)} />
            <Kpi rotulo="Ticket médio" valor={brl(rel.ticket_medio)} />
            <Kpi rotulo="Cancelados" valor={String(rel.cancelados)} detalhe={rel.cancelados ? brl(rel.valor_cancelado) : undefined} />
          </div>

          {dias.length > 1 && (
            <Grafico titulo="Vendas por dia" tabela={dias.map((d) => [dataCurta(d.dia), d.pedidos, brl(d.valor)])}>
              <BarChart data={dias} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--grade)" />
                <XAxis dataKey="rotulo" tick={{ fill: "var(--eixo)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--grade)" }} interval="preserveStartEnd" minTickGap={12} />
                <YAxis tickFormatter={reais} tick={{ fill: "var(--eixo)", fontSize: 12 }} tickLine={false} axisLine={false} width={72} />
                <Tooltip {...tooltip} formatter={(v) => [brl(Number(v)), "Vendas"]} labelFormatter={(l) => `Dia ${l}`} />
                <Bar dataKey="valor" fill="var(--serie)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
              </BarChart>
            </Grafico>
          )}

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Grafico titulo="Vendas por hora do dia" tabela={horas.filter((h) => h.pedidos).map((h) => [h.rotulo, h.pedidos, brl(h.valor)])}>
              <BarChart data={horas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke="var(--grade)" />
                <XAxis dataKey="rotulo" tick={{ fill: "var(--eixo)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--grade)" }} interval={2} />
                <YAxis tickFormatter={reais} tick={{ fill: "var(--eixo)", fontSize: 12 }} tickLine={false} axisLine={false} width={72} />
                <Tooltip {...tooltip} formatter={(v, _n, item) => [`${brl(Number(v))} · ${item.payload.pedidos} pedido(s)`, "Vendas"]} />
                <Bar dataKey="valor" fill="var(--serie)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </Grafico>

            <section className={`${card} space-y-3`} aria-label="Vendas por forma de pagamento">
              <h2 className="font-semibold">Por forma de pagamento</h2>
              {rel.por_forma.length === 0 ? <p className="text-sm text-neutral-500">Sem vendas no período.</p> : (
                <div className="flex flex-wrap items-center gap-4">
                  <div className="h-40 w-40 shrink-0">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={rel.por_forma.map((f) => ({ ...f, valor: Number(f.valor) }))} dataKey="valor" nameKey="forma"
                          innerRadius="58%" outerRadius="100%" stroke="var(--sup)" strokeWidth={2} isAnimationActive={false}>
                          {rel.por_forma.map((f) => <Cell key={f.forma} fill={COR_FORMA[f.forma]} />)}
                        </Pie>
                        <Tooltip {...tooltip} formatter={(v, n) => [brl(Number(v)), ROTULO_FORMA(String(n))]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {/* Legenda com valor e %: identidade nunca só pela cor, e serve de tabela. */}
                  <ul className="min-w-40 flex-1 space-y-1.5 text-sm">
                    {rel.por_forma.map((f) => (
                      <li key={f.forma} className="flex items-center gap-2">
                        <span className="size-3 shrink-0 rounded-sm" style={{ background: COR_FORMA[f.forma] }} aria-hidden />
                        <span className="flex-1">{ROTULO_FORMA(f.forma)}</span>
                        <span className="tabular-nums">{brl(f.valor)}</span>
                        <span className="w-11 text-right text-neutral-500 tabular-nums">{totalFormas ? Math.round((Number(f.valor) / totalFormas) * 100) : 0}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <section className={`${card} overflow-x-auto p-0`} aria-label="Produtos mais vendidos">
              <h2 className="p-4 pb-2 font-semibold">Top 10 produtos</h2>
              {rel.top_produtos.length === 0 ? <p className="px-4 pb-4 text-sm text-neutral-500">Sem vendas no período.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
                    <th className="px-4 py-2 font-medium">#</th><th className="py-2 font-medium">Produto</th>
                    <th className="px-3 py-2 text-right font-medium">Qtd.</th><th className="px-4 py-2 text-right font-medium">Valor</th>
                  </tr></thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {rel.top_produtos.map((p, n) => (
                      <tr key={p.nome + n}>
                        <td className="px-4 py-2 text-neutral-500 tabular-nums">{n + 1}</td>
                        <td className="py-2">{p.nome}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.quantidade}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{brl(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <div className="space-y-4">
              <Tabela titulo="Por tipo" linhas={rel.por_tipo.map((t) => [TIPOS[t.tipo], t.pedidos, Number(t.valor)])} />
              <Tabela titulo="Por origem" linhas={rel.por_origem.map((o) => [ORIGEM[o.origem], o.pedidos, Number(o.valor)])} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className={card}>
      <p className="text-sm text-neutral-500">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-neutral-500 tabular-nums">{detalhe}</p>}
    </div>
  );
}

function Grafico({ titulo, tabela, children }: { titulo: string; tabela: (string | number)[][]; children: React.ReactElement }) {
  return (
    <section className={`${card} space-y-2`} aria-label={titulo}>
      <h2 className="font-semibold">{titulo}</h2>
      <div className="h-56"><ResponsiveContainer>{children}</ResponsiveContainer></div>
      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-500">Ver dados em tabela</summary>
        <table className="mt-2 w-full">
          <thead><tr className="text-left text-neutral-500"><th className="py-1 font-medium">Período</th><th className="py-1 text-right font-medium">Pedidos</th><th className="py-1 text-right font-medium">Valor</th></tr></thead>
          <tbody>{tabela.map((l) => <tr key={String(l[0])}>{l.map((c, n) => <td key={n} className={`py-0.5 tabular-nums ${n ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

function Tabela({ titulo, linhas }: { titulo: string; linhas: [string, number, number][] }) {
  return (
    <section className={card} aria-label={titulo}>
      <h2 className="mb-2 font-semibold">{titulo}</h2>
      {linhas.length === 0 ? <p className="text-sm text-neutral-500">Sem vendas.</p> : (
        <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
          {linhas.map(([nome, pedidos, valor]) => (
            <div key={nome} className="flex justify-between gap-2 py-1.5">
              <dt>{nome} <span className="text-neutral-500">· {pedidos}</span></dt><dd className="tabular-nums">{brl(valor)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
