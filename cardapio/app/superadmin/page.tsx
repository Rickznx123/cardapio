"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { type PlanoStatus, situacaoPlano } from "@/lib/planos";
import { botao, botaoSec, card, input, rotulo } from "../painel/ui";

type Empresa = {
  id: string; nome: string; slug: string; ativo: boolean; created_at: string; pedidos_30d: number; dono_email: string | null;
  plano_status: PlanoStatus; trial_ate: string | null; pago_ate: string | null; forma_assinatura: "cartao" | "pix" | null;
  cortesia: boolean; origem_cadastro: "self" | "superadmin";
};

const ROTULO_PLANO: Record<PlanoStatus, string> = { trial: "Teste", ativo: "Assinante", vencido: "Vencido", cancelado: "Cancelado" };

async function api(metodo: "GET" | "POST" | "PATCH", corpo?: object) {
  const r = await fetch("/api/superadmin", {
    method: metodo, headers: { "Content-Type": "application/json" }, body: corpo && JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

// Super admin: só ver dados, criar empresa + dono e ativar/desativar. Acesso checado no server (SUPERADMIN_EMAILS).
export default function Superadmin() {
  const [empresas, setEmpresas] = useState<Empresa[] | null | undefined>();
  const [criando, setCriando] = useState(false);
  const [agora, setAgora] = useState(0); // hora da última carga (dias restantes do trial)
  const [versao, setVersao] = useState(0);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    api("GET").then(({ ok, j }) => { setAgora(Date.now()); setEmpresas(ok ? j : null); });
  }, [versao]);

  async function alternar(e: Empresa) {
    if (e.ativo && !confirm(`Desativar ${e.nome}? O cardápio fica indisponível e o painel bloqueado.`)) return;
    const { ok, j } = await api("PATCH", { empresa_id: e.id, ativo: !e.ativo });
    if (!ok) return toast.erro(j.erro ?? "Erro");
    toast.ok(e.ativo ? "Empresa desativada" : "Empresa ativada");
    recarregar();
  }

  async function plano(e: Empresa, acao: "estender_trial" | "marcar_ativo" | "cortesia" | "mais_30_dias") {
    if (acao === "marcar_ativo" && !confirm(`Marcar ${e.nome} como assinante (plano ativo)?`)) return;
    if (acao === "cortesia" && !confirm(`${e.cortesia ? "Tirar" : "Dar"} cortesia para ${e.nome}?`)) return;
    const { ok, j } = await api("PATCH", { empresa_id: e.id, acao });
    if (!ok) return toast.erro(j.erro ?? "Erro");
    toast.ok({ marcar_ativo: "Plano ativo", estender_trial: "Teste estendido em 7 dias",
      cortesia: e.cortesia ? "Cortesia removida" : "Cortesia ativada", mais_30_dias: "+30 dias pagos" }[acao]);
    recarregar();
  }

  if (empresas === undefined) return <p className="p-6">Carregando…</p>;
  if (empresas === null) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">Sem acesso</h1>
        <p className="text-neutral-500">Entre com uma conta de administrador da plataforma.</p>
        <Link href="/login" className={botao}>Entrar</Link>
      </main>
    );
  }

  const ativas = empresas.filter((e) => e.ativo).length;
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-8">
      <header className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="size-7 text-rose-600" />
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">Super admin</h1>
          <p className="text-sm text-neutral-500">{empresas.length} empresas · {ativas} ativas · {empresas.filter((e) => e.cortesia).length} com cortesia</p>
        </div>
        <button onClick={() => setCriando(true)} className={botao}><Plus className="size-5" /> Nova empresa</button>
      </header>

      <ul className={`${card} divide-y divide-neutral-200 p-0 dark:divide-neutral-800`}>
        {empresas.map((e) => (
          <li key={e.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 p-4 ${e.ativo ? "" : "opacity-60"}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{e.nome}</p>
              <p className="truncate text-sm text-neutral-500">
                /{e.slug}{e.dono_email ? ` · ${e.dono_email}` : ""} · criada em {new Date(e.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <p className="text-sm tabular-nums"><b>{e.pedidos_30d}</b> pedidos em 30 dias</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <span>{e.forma_assinatura ? `Assinatura ${e.forma_assinatura}` : "Sem assinatura"}</span>
              <span>·</span>
              <span>{e.pago_ate ? `pago até ${new Date(e.pago_ate).toLocaleDateString("pt-BR")}` : "sem pagamento"}</span>
            </div>
            <Plano e={e} agora={agora} />
            <span className="flex gap-1.5">
              <button onClick={() => plano(e, "estender_trial")} className={botaoSec}>+7 dias</button>
              <button onClick={() => plano(e, "marcar_ativo")} className={botaoSec}>Marcar ativo</button>
              <button onClick={() => plano(e, "cortesia")} className={botaoSec} aria-pressed={e.cortesia}>
                {e.cortesia ? "Cortesia on" : "Cortesia off"}
              </button>
              <button onClick={() => plano(e, "mais_30_dias")} className={botaoSec}>+30 dias</button>
            </span>
            <Link href={`/${e.slug}`} target="_blank" aria-label={`Abrir cardápio de ${e.nome}`}
              className="flex size-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <ExternalLink className="size-5" />
            </Link>
            <button role="switch" aria-checked={e.ativo} aria-label={`${e.nome} ativa`} onClick={() => alternar(e)}
              className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${e.ativo ? "justify-end bg-emerald-600" : "justify-start bg-neutral-300 dark:bg-neutral-700"}`}>
              <span className="size-5 rounded-full bg-white shadow" />
            </button>
          </li>
        ))}
        {!empresas.length && <li className="p-6 text-center text-neutral-500">Nenhuma empresa ainda.</li>}
      </ul>

      {criando && <NovaEmpresa fechar={() => setCriando(false)} criada={() => { setCriando(false); recarregar(); }} />}
    </main>
  );
}

function Plano({ e, agora }: { e: Empresa; agora: number }) {
  const s = situacaoPlano(e, agora);
  const cor = e.plano_status === "ativo" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    : s.liberada ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>
      {ROTULO_PLANO[e.plano_status]}
      {s.trial && (s.liberada ? ` · ${s.diasRestantes}d` : " vencido")}
      {e.origem_cadastro === "self" && " · self"}
    </span>
  );
}

function NovaEmpresa({ fechar, criada }: { fechar: () => void; criada: () => void }) {
  const [enviando, setEnviando] = useState(false);

  async function criar(f: FormData) {
    setEnviando(true);
    const { ok, j } = await api("POST", Object.fromEntries(f));
    setEnviando(false);
    if (!ok) return toast.erro(j.erro ?? "Erro ao criar");
    toast.ok("Empresa criada. Passe o e-mail e a senha provisória ao dono.");
    criada();
  }

  return (
    <Modal titulo="Nova empresa" fechar={fechar}>
      <form onSubmit={(e) => { e.preventDefault(); criar(new FormData(e.currentTarget)); }} className="space-y-3 p-5">
        <label className="block"><span className={rotulo}>Nome da empresa</span>
          <input name="nome" required className={input} />
        </label>
        <label className="block"><span className={rotulo}>Endereço do cardápio (slug)</span>
          <input name="slug" required pattern="[a-z0-9\-]{3,40}" title="3 a 40 caracteres: letras minúsculas, números e hífen"
            className={input} />
        </label>
        <label className="block"><span className={rotulo}>Nome do dono</span>
          <input name="dono_nome" required className={input} />
        </label>
        <label className="block"><span className={rotulo}>E-mail do dono</span>
          <input name="email" type="email" required autoComplete="off" className={input} />
        </label>
        <label className="block"><span className={rotulo}>Senha provisória (mín. 8)</span>
          <input name="senha" required minLength={8} autoComplete="new-password" className={input} />
        </label>
        <button disabled={enviando} className={`${botao} w-full`}>{enviando ? "Criando…" : "Criar empresa e dono"}</button>
      </form>
    </Modal>
  );
}
