"use client";

import { useEffect, useState } from "react";
import { Copy, CreditCard, QrCode } from "lucide-react";
import { toast } from "@/components/toast";
import { cartaoAtivo, PRECO_MENSAL } from "@/lib/planos";
import { brl } from "@/lib/tipos";
import type { Empresa } from "./configuracoes";
import { botaoSec, card, supabase } from "./ui";

type Pix = { id: string; qr_code: string; qr_code_base64: string };
type Pagamento = { mp_id: string; tipo: "cartao" | "pix"; status: string; valor: number; periodo_fim: string | null; created_at: string };

const STATUS: Record<string, string> = { pendente: "Aguardando", aprovado: "Aprovado", recusado: "Recusado", cancelado: "Cancelado", estornado: "Estornado" };
const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

async function chamar<T>(url: string, method = "POST"): Promise<T> {
  const r = await fetch(url, { method });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro ?? "Algo deu errado. Tente de novo.");
  return corpo as T;
}

// Botões de pagamento (cartão recorrente ou Pix de 30 dias). Usado na seção Assinatura, no modal do trial e na tela de vencido.
export function PagarAssinatura({ empresa }: { empresa: Empresa }) {
  const [carregando, setCarregando] = useState<"cartao" | "pix" | null>(null);
  const [pix, setPix] = useState<Pix | null>(null);
  const [statusPix, setStatusPix] = useState("pendente");

  // Confere o Pix a cada 5s até sair de "pendente". Aprovado: recarrega para liberar o painel com o plano novo.
  useEffect(() => {
    if (!pix || statusPix !== "pendente") return;
    const timer = window.setInterval(async () => {
      const r = await chamar<{ status: string }>(`/api/assinatura/pix/${pix.id}/status`, "GET").catch(() => null);
      if (!r || r.status === "pendente") return;
      setStatusPix(r.status);
      if (r.status === "aprovado") {
        toast.ok("Pagamento confirmado!");
        window.setTimeout(() => location.reload(), 1500);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pix, statusPix]);

  async function cartao() {
    setCarregando("cartao");
    try {
      location.href = (await chamar<{ url: string }>("/api/assinatura/cartao")).url;
    } catch (e) {
      toast.erro((e as Error).message);
      setCarregando(null);
    }
  }

  async function gerarPix() {
    setCarregando("pix");
    try {
      setPix(await chamar<Pix>("/api/assinatura/pix"));
      setStatusPix("pendente");
    } catch (e) {
      toast.erro((e as Error).message);
    }
    setCarregando(null);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(pix!.qr_code);
      toast.ok("Código Pix copiado");
    } catch {
      toast.erro("Não foi possível copiar. Selecione o código e copie manualmente.");
    }
  }

  if (empresa.cortesia) return null;
  if (pix) {
    return (
      <div className="space-y-3 text-center">
        {statusPix === "aprovado" ? (
          <p role="status" className="rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Pagamento confirmado! Atualizando…
          </p>
        ) : statusPix !== "pendente" ? (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            Este Pix foi {STATUS[statusPix]?.toLowerCase() ?? statusPix}. Gere um novo para pagar.
          </p>
        ) : (
          <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
            Pague {brl(PRECO_MENSAL)} no app do banco. A confirmação aparece aqui sozinha.
          </p>
        )}
        {pix.qr_code_base64 && (
          <img src={`data:image/png;base64,${pix.qr_code_base64}`} alt="QR Code do Pix"
            className="mx-auto size-56 rounded-xl border border-neutral-200 bg-white p-2" />
        )}
        <label className="block text-left text-sm font-medium" htmlFor="pix-copia-cola">Pix copia e cola</label>
        <div className="flex gap-2">
          <input id="pix-copia-cola" readOnly value={pix.qr_code} onFocus={(e) => e.currentTarget.select()}
            className="h-11 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950" />
          <button type="button" onClick={copiar} className={botaoSec}><Copy className="size-4" /> Copiar</button>
        </div>
        <button type="button" onClick={() => setPix(null)} className="text-sm text-neutral-500 underline">Voltar</button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {!cartaoAtivo(empresa) && (
        <>
          <button type="button" onClick={cartao} disabled={!!carregando}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            <CreditCard className="size-5" /> {carregando === "cartao" ? "Abrindo Mercado Pago…" : "Assinar no cartão"}
          </button>
          <button type="button" onClick={gerarPix} disabled={!!carregando}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-5 font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white">
            <QrCode className="size-5" /> {carregando === "pix" ? "Gerando Pix…" : "Pagar 30 dias no Pix"}
          </button>
        </>
      )}
    </div>
  );
}

function titulo(e: Empresa) {
  if (e.cortesia) return "Cortesia ativa";
  if (e.plano_status === "trial") return "Teste grátis";
  if (e.plano_status === "cancelado") return "Assinatura cancelada";
  if (e.plano_status === "vencido") return "Plano vencido";
  return e.forma_assinatura === "pix" ? "Plano ativo (Pix)" : "Assinatura ativa no cartão";
}

// Painel ▸ Assinatura: situação, pagar, cancelar e histórico.
export function Assinatura({ empresa }: { empresa: Empresa }) {
  const [historico, setHistorico] = useState<Pagamento[] | null>(null);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => {
    supabase.from("pagamentos").select("mp_id, tipo, status, valor, periodo_fim, created_at")
      .eq("empresa_id", empresa.id).order("created_at", { ascending: false }).limit(24)
      .then(({ data, error }) => {
        if (error) toast.erro("Não foi possível carregar o histórico de pagamentos.");
        setHistorico((data ?? []) as Pagamento[]);
      });
  }, [empresa.id]);

  async function cancelar() {
    const ate = empresa.pago_ate ? ` Seu acesso continua até ${data(empresa.pago_ate)}.` : "";
    if (!confirm(`Cancelar a assinatura no cartão? Não haverá novas cobranças.${ate}`)) return;
    setCancelando(true);
    try {
      await chamar("/api/assinatura/cancelar");
      toast.ok("Assinatura cancelada");
      location.reload();
    } catch (e) {
      toast.erro((e as Error).message);
      setCancelando(false);
    }
  }

  const recorrente = cartaoAtivo(empresa);
  return (
    <div className="space-y-4">
      <section className={`${card} space-y-4`}>
        <div>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Status da assinatura</p>
          <h2 className="text-2xl font-bold">{titulo(empresa)}</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-xs uppercase tracking-wide text-neutral-500">
              {empresa.plano_status === "trial" ? "Teste até" : recorrente ? "Próxima cobrança" : "Pago até"}
            </p>
            <p className="mt-2 text-lg font-semibold">
              {empresa.plano_status === "trial" && empresa.trial_ate ? data(empresa.trial_ate)
                : empresa.pago_ate ? data(empresa.pago_ate) : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-xs uppercase tracking-wide text-neutral-500">Plano</p>
            <p className="mt-2 text-lg font-semibold">{brl(PRECO_MENSAL)}/mês</p>
          </div>
        </div>
        {empresa.cortesia ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Sua loja tem acesso liberado pela plataforma, sem cobrança.</p>
        ) : recorrente ? (
          <button type="button" onClick={cancelar} disabled={cancelando} className={`${botaoSec} text-red-700 dark:text-red-400`}>
            {cancelando ? "Cancelando…" : "Cancelar assinatura"}
          </button>
        ) : (
          <PagarAssinatura empresa={empresa} />
        )}
      </section>

      <section className={card}>
        <h3 className="mb-3 font-semibold">Histórico de pagamentos</h3>
        {!historico ? <p className="text-sm text-neutral-500">Carregando…</p>
          : !historico.length ? <p className="text-sm text-neutral-500">Nenhum pagamento ainda.</p> : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {historico.map((p) => (
                <li key={p.mp_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <b>{data(p.created_at)}</b> · {p.tipo === "pix" ? "Pix" : "Cartão"}
                    {p.status === "aprovado" && p.periodo_fim && <span className="text-neutral-500"> · até {data(p.periodo_fim)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums">{brl(Number(p.valor))}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.status === "aprovado"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : p.status === "recusado" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
                      {STATUS[p.status] ?? p.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
