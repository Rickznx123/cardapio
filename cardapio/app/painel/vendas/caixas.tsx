"use client";

import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Lock, Printer, RefreshCw } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { type ConfigImpressao, cupomFechamento, type ResumoCaixa } from "@/lib/cupom";
import { imprimir } from "@/lib/impressao";
import { createClient } from "@/lib/supabase/client";
import { brl, FORMAS, type FormaPagamento, TODAS_FORMAS } from "@/lib/tipos";
import { AbrirCaixa, useCaixaAberto } from "../caixa-aberto";
import { card } from "../ui";

const supabase = createClient();
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const lerValor = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(/\./g, "").replace(",", ".")));
const corDif = (d: number) => (Math.abs(d) < 0.01 ? "text-neutral-500" : d > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400");
const sinal = (d: number) => `${d > 0.004 ? "+" : ""}${brl(d)}`;

async function carregarResumo(caixaId: string) {
  const { data, error } = await supabase.rpc("resumo_caixa", { p_caixa_id: caixaId });
  if (error) { toast.erro(error.message); return null; }
  return data as ResumoCaixa;
}

type Props = { empresaId: string; empresaNome: string; formas: FormaPagamento[]; config: ConfigImpressao | null };

// Vendas ▸ Caixas: caixa atual (movimentos e fechamento) + histórico de caixas.
export function Caixas({ empresaId, empresaNome, formas, config }: Props) {
  const [caixa, recarregarCaixa] = useCaixaAberto(empresaId);
  const [resumo, setResumo] = useState<ResumoCaixa | null>(null);
  const [versao, setVersao] = useState(0);
  const [movimento, setMovimento] = useState<"sangria" | "suprimento" | null>(null);
  const [fechando, setFechando] = useState(false);
  const recarregar = () => { setVersao((v) => v + 1); recarregarCaixa(); };

  useEffect(() => {
    if (caixa) carregarResumo(caixa.id).then(setResumo);
  }, [caixa, versao]);

  return (
    <div className="space-y-6">
      {caixa === undefined ? (
        <div className="h-48 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      ) : caixa === null ? (
        <section className={`${card} space-y-3`}>
          <h2 className="text-lg font-semibold">Caixa fechado</h2>
          <p className="text-sm text-neutral-500">Abra o caixa para registrar os recebimentos do turno.</p>
          <AbrirCaixa empresaId={empresaId} aberto={recarregar} />
        </section>
      ) : !resumo ? (
        <div className="h-48 animate-pulse rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
      ) : (
        <section className={`${card} space-y-4 border-emerald-300 dark:border-emerald-900`} aria-label="Caixa atual">
          <div className="flex flex-wrap items-start gap-3">
            <div className="mr-auto">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="size-2.5 rounded-full bg-emerald-500" /> Caixa aberto
              </p>
              <p className="text-sm text-neutral-500">
                Desde {quando(resumo.caixa.aberto_em)}{resumo.aberto_por_nome && ` · ${resumo.aberto_por_nome}`}
              </p>
            </div>
            <button onClick={recarregar} aria-label="Atualizar" className="flex size-10 items-center justify-center rounded-lg border border-neutral-300 dark:border-neutral-700">
              <RefreshCw className="size-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi rotulo="Dinheiro esperado na gaveta" valor={brl(resumo.esperado.dinheiro)} destaque />
            <Kpi rotulo={`Vendas recebidas (${resumo.qtd_pedidos})`} valor={brl(resumo.total_vendas)} />
            <Kpi rotulo="Valor inicial" valor={brl(resumo.caixa.valor_inicial)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-neutral-500">Entradas por forma</h3>
              <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                {TODAS_FORMAS.map((f) => (
                  <div key={f} className="flex justify-between py-1.5"><dt>{FORMAS[f]}</dt><dd className="tabular-nums">{brl(resumo.entradas[f] ?? 0)}</dd></div>
                ))}
                <div className="flex justify-between py-1.5"><dt>Suprimentos</dt><dd className="tabular-nums">+{brl(resumo.suprimentos)}</dd></div>
                <div className="flex justify-between py-1.5"><dt>Sangrias</dt><dd className="tabular-nums">−{brl(resumo.sangrias)}</dd></div>
              </dl>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold text-neutral-500">Movimentos</h3>
              {resumo.movimentos.length === 0 ? <p className="py-1.5 text-sm text-neutral-500">Nenhuma sangria ou suprimento.</p> : (
                <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                  {resumo.movimentos.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-1.5">
                      {m.tipo === "sangria" ? <ArrowUpCircle className="size-4 text-red-600" aria-label="Sangria" /> : <ArrowDownCircle className="size-4 text-emerald-600" aria-label="Suprimento" />}
                      <span className="min-w-0 flex-1 truncate">{m.motivo ?? (m.tipo === "sangria" ? "Sangria" : "Suprimento")}
                        <span className="text-neutral-500"> · {new Date(m.created_at).toLocaleTimeString("pt-BR", { timeStyle: "short" })}</span></span>
                      <span className="tabular-nums">{m.tipo === "sangria" ? "−" : "+"}{brl(m.valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setMovimento("sangria")} className="flex h-11 items-center gap-2 rounded-lg border border-neutral-300 px-4 font-semibold dark:border-neutral-700">
              <ArrowUpCircle className="size-5" /> Sangria
            </button>
            <button onClick={() => setMovimento("suprimento")} className="flex h-11 items-center gap-2 rounded-lg border border-neutral-300 px-4 font-semibold dark:border-neutral-700">
              <ArrowDownCircle className="size-5" /> Suprimento
            </button>
            <button onClick={() => setFechando(true)} className="ml-auto flex h-11 items-center gap-2 rounded-lg bg-neutral-900 px-4 font-semibold text-white dark:bg-white dark:text-neutral-900">
              <Lock className="size-5" /> Fechar caixa
            </button>
          </div>
        </section>
      )}

      <Historico empresaId={empresaId} empresaNome={empresaNome} config={config} versao={versao} />

      {movimento && <MovimentoModal tipo={movimento} empresaId={empresaId} fechar={() => setMovimento(null)} salvo={() => { setMovimento(null); recarregar(); }} />}
      {fechando && resumo && (
        <FecharCaixaModal resumo={resumo} formas={formas} empresaId={empresaId} empresaNome={empresaNome} config={config}
          fechar={() => setFechando(false)} fechado={() => { setFechando(false); setResumo(null); recarregar(); }} />
      )}
    </div>
  );
}

function Kpi({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${destaque ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-neutral-50 dark:bg-neutral-800/50"}`}>
      <p className="text-xs text-neutral-500">{rotulo}</p>
      <p className={`font-bold tabular-nums ${destaque ? "text-2xl" : "text-xl"}`}>{valor}</p>
    </div>
  );
}

function MovimentoModal({ tipo, empresaId, fechar, salvo }: {
  tipo: "sangria" | "suprimento"; empresaId: string; fechar: () => void; salvo: () => void;
}) {
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const nome = tipo === "sangria" ? "Sangria" : "Suprimento";

  async function salvar() {
    const n = lerValor(valor);
    if (!(n > 0)) return toast.erro("Informe um valor maior que zero");
    setEnviando(true);
    const { error } = await supabase.rpc("registrar_movimento", { p_empresa_id: empresaId, p_tipo: tipo, p_valor: n, p_motivo: motivo });
    setEnviando(false);
    if (error) return toast.erro(error.message);
    toast.ok(`${nome} de ${brl(n)} registrada`);
    salvo();
  }

  return (
    <Modal titulo={nome} fechar={fechar}
      rodape={<button form="movimento" disabled={enviando} className="h-12 w-full rounded-lg bg-rose-600 font-semibold text-white disabled:opacity-50">
        {enviando ? "Salvando…" : `Registrar ${nome.toLowerCase()}`}</button>}>
      <form id="movimento" className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <p className="text-sm text-neutral-500">
          {tipo === "sangria" ? "Retirada de dinheiro da gaveta (ex.: depósito, pagamento de fornecedor)." : "Entrada de dinheiro na gaveta (ex.: reforço de troco)."}
        </p>
        <label className="block"><span className="mb-1 block text-sm font-medium">Valor</span>
          <input value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" placeholder="0,00" required autoFocus
            className="h-12 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-lg dark:border-neutral-700" />
        </label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Motivo</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120}
            className="h-11 w-full rounded-lg border border-neutral-300 bg-transparent px-3 dark:border-neutral-700" />
        </label>
      </form>
    </Modal>
  );
}

function FecharCaixaModal({ resumo, formas, empresaId, empresaNome, config, fechar, fechado }: {
  resumo: ResumoCaixa; formas: FormaPagamento[]; empresaId: string; empresaNome: string; config: ConfigImpressao | null;
  fechar: () => void; fechado: () => void;
}) {
  // Conta as formas aceitas e qualquer outra que tenha entrada no caixa.
  const lista = TODAS_FORMAS.filter((f) => formas.includes(f) || Number(resumo.esperado[f]) > 0);
  const [contado, setContado] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResumoCaixa | null>(null);

  async function confirmar() {
    const valores = Object.fromEntries(lista.map((f) => [f, lerValor(contado[f] ?? "")]));
    if (Object.values(valores).some((v) => Number.isNaN(v) || v < 0)) return toast.erro("Confira os valores contados");
    setEnviando(true);
    const { data, error } = await supabase.rpc("fechar_caixa", { p_empresa_id: empresaId, p_valores_informados: valores, p_observacao: obs });
    setEnviando(false);
    if (error) return toast.erro(error.message);
    const final = (data as { resumo: ResumoCaixa }).resumo;
    setResultado(final);
    imprimir(cupomFechamento(empresaNome, final, config));
    toast.ok("Caixa fechado. Imprimindo resumo.");
  }

  if (resultado) {
    return (
      <Modal titulo="Caixa fechado" fechar={fechado}
        rodape={<div className="flex gap-2">
          <button onClick={() => imprimir(cupomFechamento(empresaNome, resultado, config))}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-300 font-semibold dark:border-neutral-700">
            <Printer className="size-5" /> Imprimir de novo
          </button>
          <button onClick={fechado} className="h-12 flex-1 rounded-lg bg-rose-600 font-semibold text-white">Concluir</button>
        </div>}>
        <ConferenciaCaixa resumo={resultado} />
      </Modal>
    );
  }

  return (
    <Modal titulo="Fechar caixa" fechar={fechar} tamanho="sm:max-w-xl"
      rodape={<button form="fechar-caixa" disabled={enviando} className="h-12 w-full rounded-lg bg-neutral-900 font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">
        {enviando ? "Fechando…" : "Fechar caixa e imprimir resumo"}</button>}>
      <form id="fechar-caixa" className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); confirmar(); }}>
        <p className="text-sm text-neutral-500">Conte o que há em cada forma e informe abaixo. A diferença aparece na hora.</p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-neutral-500"><th className="py-1 font-medium">Forma</th><th className="py-1 text-right font-medium">Esperado</th><th className="py-1 pl-3 font-medium">Contado</th><th className="py-1 text-right font-medium">Diferença</th></tr></thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {lista.map((f) => {
              const esperado = Number(resumo.esperado[f] ?? 0);
              const dif = lerValor(contado[f] ?? "") - esperado;
              const preenchido = (contado[f] ?? "").trim() !== "";
              return (
                <tr key={f}>
                  <td className="py-2 font-medium">{FORMAS[f]}</td>
                  <td className="py-2 text-right tabular-nums">{brl(esperado)}</td>
                  <td className="py-2 pl-3">
                    <input value={contado[f] ?? ""} onChange={(e) => setContado((c) => ({ ...c, [f]: e.target.value.replace(/[^\d,.]/g, "") }))}
                      inputMode="decimal" placeholder="0,00" aria-label={`Contado em ${FORMAS[f]}`}
                      className="h-10 w-28 rounded-lg border border-neutral-300 bg-transparent px-2 text-right tabular-nums dark:border-neutral-700" />
                  </td>
                  <td className={`py-2 text-right font-semibold tabular-nums ${preenchido ? corDif(dif) : "text-neutral-400"}`}>
                    {preenchido ? sinal(dif) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <label className="block"><span className="mb-1 block text-sm font-medium">Observação</span>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} maxLength={300}
            className="w-full rounded-lg border border-neutral-300 bg-transparent p-3 dark:border-neutral-700" />
        </label>
      </form>
    </Modal>
  );
}

// Esperado × contado de um caixa fechado (usado no resultado do fechamento e no detalhe do histórico).
function ConferenciaCaixa({ resumo }: { resumo: ResumoCaixa }) {
  const inf = resumo.caixa.valores_informados ?? {};
  const formas = TODAS_FORMAS.filter((f) => Number(resumo.esperado[f]) || inf[f] != null);
  const totalDif = formas.reduce((s, f) => s + Number(inf[f] ?? 0) - Number(resumo.esperado[f] ?? 0), 0);
  return (
    <div className="space-y-4 p-5">
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-neutral-500">Abertura</dt><dd>{quando(resumo.caixa.aberto_em)}{resumo.aberto_por_nome && ` · ${resumo.aberto_por_nome}`}</dd>
        <dt className="text-neutral-500">Fechamento</dt><dd>{quando(resumo.caixa.fechado_em)}{resumo.fechado_por_nome && ` · ${resumo.fechado_por_nome}`}</dd>
        <dt className="text-neutral-500">Valor inicial</dt><dd className="tabular-nums">{brl(resumo.caixa.valor_inicial)}</dd>
        <dt className="text-neutral-500">Vendas ({resumo.qtd_pedidos})</dt><dd className="tabular-nums">{brl(resumo.total_vendas)}</dd>
        <dt className="text-neutral-500">Suprimentos / sangrias</dt><dd className="tabular-nums">+{brl(resumo.suprimentos)} / −{brl(resumo.sangrias)}</dd>
      </dl>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-neutral-500"><th className="py-1 font-medium">Forma</th><th className="py-1 text-right font-medium">Esperado</th><th className="py-1 text-right font-medium">Contado</th><th className="py-1 text-right font-medium">Diferença</th></tr></thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {formas.map((f) => {
            const dif = Number(inf[f] ?? 0) - Number(resumo.esperado[f] ?? 0);
            return (
              <tr key={f}>
                <td className="py-2">{FORMAS[f]}</td>
                <td className="py-2 text-right tabular-nums">{brl(resumo.esperado[f] ?? 0)}</td>
                <td className="py-2 text-right tabular-nums">{brl(inf[f] ?? 0)}</td>
                <td className={`py-2 text-right font-semibold tabular-nums ${corDif(dif)}`}>{sinal(dif)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot><tr className="border-t border-neutral-200 dark:border-neutral-700">
          <td colSpan={3} className="py-2 font-semibold">Diferença total</td>
          <td className={`py-2 text-right font-bold tabular-nums ${corDif(totalDif)}`}>{sinal(totalDif)}</td>
        </tr></tfoot>
      </table>
      {resumo.caixa.observacao && <p className="rounded-lg bg-neutral-100 p-3 text-sm dark:bg-neutral-800">Obs.: {resumo.caixa.observacao}</p>}
    </div>
  );
}

type CaixaLinha = { id: string; aberto_em: string; fechado_em: string | null; valor_inicial: number };

function Historico({ empresaId, empresaNome, config, versao }: { empresaId: string; empresaNome: string; config: ConfigImpressao | null; versao: number }) {
  const [lista, setLista] = useState<CaixaLinha[] | null>(null);
  const [limite, setLimite] = useState(15);
  const [aberto, setAberto] = useState<ResumoCaixa | null>(null);

  useEffect(() => {
    supabase.from("caixas").select("id, aberto_em, fechado_em, valor_inicial").eq("empresa_id", empresaId).eq("status", "fechado")
      .order("aberto_em", { ascending: false }).limit(limite + 1)
      .then(({ data, error }) => (error ? toast.erro(error.message) : setLista(data)));
  }, [empresaId, limite, versao]);

  return (
    <section className="space-y-2" aria-label="Caixas anteriores">
      <h2 className="text-lg font-semibold">Caixas anteriores</h2>
      {lista === null ? null : lista.length === 0 ? <p className="text-sm text-neutral-500">Nenhum caixa fechado ainda.</p> : (
        <>
          <ul className={`${card} divide-y divide-neutral-200 p-0 dark:divide-neutral-800`}>
            {lista.slice(0, limite).map((c) => (
              <li key={c.id}>
                <button onClick={() => carregarResumo(c.id).then((r) => r && setAberto(r))}
                  className="flex w-full items-center gap-3 p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{quando(c.aberto_em)}</span>
                    <span className="block text-xs text-neutral-500">até {quando(c.fechado_em)}</span>
                  </span>
                  <span className="text-sm text-neutral-500">Ver detalhe</span>
                </button>
              </li>
            ))}
          </ul>
          {lista.length > limite && (
            <button onClick={() => setLimite((l) => l + 15)} className="h-10 w-full rounded-lg border border-neutral-300 text-sm font-medium dark:border-neutral-700">
              Carregar mais
            </button>
          )}
        </>
      )}
      {aberto && (
        <Drawer titulo="Caixa" fechar={() => setAberto(null)}
          rodape={<button onClick={() => imprimir(cupomFechamento(empresaNome, aberto, config))}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-neutral-300 font-semibold dark:border-neutral-700">
            <Printer className="size-5" /> Reimprimir resumo</button>}>
          <ConferenciaCaixa resumo={aberto} />
        </Drawer>
      )}
    </section>
  );
}
