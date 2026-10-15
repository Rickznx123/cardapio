// Assinatura (server only): processa recursos do Mercado Pago, e-mails idempotentes e o dono logado das rotas.
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarEmail, type TipoEmail } from "@/lib/email";
import { FUSO } from "@/lib/horarios";
import {
  type AuthorizedPayment, buscarAuthorizedPayment, buscarCobrancasAssinatura, buscarPayment, buscarPreapproval, type FormaAssinatura,
  type StatusPagamento, statusPagamento,
} from "@/lib/mercadopago";
import type { PlanoStatus } from "@/lib/planos";
import { createClient } from "@/lib/supabase/server";

export const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO });

export type EmpresaDono = {
  id: string; nome: string; plano_status: PlanoStatus; forma_assinatura: FormaAssinatura | null;
  mp_preapproval_id: string | null; cortesia: boolean;
};

// Dono ativo logado e a empresa dele (mesmo critério do painel: a primeira). null = sem permissão.
export async function donoLogado() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase.from("membros")
    .select("empresas(id, nome, plano_status, forma_assinatura, mp_preapproval_id, cortesia)")
    .eq("user_id", user.id).eq("papel", "dono").eq("ativo", true).limit(1).maybeSingle();
  const empresa = data?.empresas as unknown as EmpresaDono | null;
  return empresa ? { email: user.email, empresa, supabase } : null;
}

// Envia uma vez por (empresa, chave). Se o envio falhar, libera a chave para tentar de novo.
export async function avisar(admin: SupabaseClient, empresaId: string, chave: string, tipo: TipoEmail, data: string) {
  const { data: novo, error } = await admin.from("emails_enviados")
    .upsert({ empresa_id: empresaId, chave }, { onConflict: "empresa_id,chave", ignoreDuplicates: true }).select();
  if (error) throw new Error(`emails_enviados: ${error.message}`);
  if (!novo?.length) return false;
  try {
    const { data: empresa } = await admin.from("empresas").select("nome").eq("id", empresaId).single();
    const { data: dono } = await admin.from("membros").select("user_id").eq("empresa_id", empresaId)
      .eq("papel", "dono").eq("ativo", true).order("created_at").limit(1).single();
    const { data: u } = await admin.auth.admin.getUserById(dono!.user_id);
    if (!u.user?.email) throw new Error("Dono sem e-mail");
    await enviarEmail(u.user.email, tipo, empresa!.nome, data, `${empresaId}:${chave}`);
    return true;
  } catch (e) {
    await admin.from("emails_enviados").delete().eq("empresa_id", empresaId).eq("chave", chave);
    throw e;
  }
}

async function registrar(
  admin: SupabaseClient, empresaId: string, tipo: FormaAssinatura, mpId: string, status: StatusPagamento, valor: number, raw: object,
) {
  const { data, error } = await admin.rpc("registrar_pagamento_mp", {
    p_empresa: empresaId, p_tipo: tipo, p_mp_id: mpId, p_status: status, p_valor: valor, p_raw: raw,
  });
  if (error) throw new Error(`registrar_pagamento_mp: ${error.message}`);
  const r = data as { mudou: boolean; primeiro: boolean };
  if (!r.mudou) return;
  // Pagamento já gravado: falha no e-mail vai para o Sentry sem desfazer nada.
  try {
    if (status === "aprovado" && r.primeiro) {
      const { data: e } = await admin.from("empresas").select("pago_ate").eq("id", empresaId).single();
      await avisar(admin, empresaId, "boas_vindas", "boas_vindas", dataBR(e!.pago_ate));
    } else if (status === "recusado") {
      await avisar(admin, empresaId, `recusado:${mpId}`, "recusado", "");
    }
  } catch (e) {
    console.error("assinatura e-mail:", e);
    Sentry.captureException(e, { tags: { rota: "assinatura-email" } });
  }
}

// Assinatura cancelada (pelo dono ou no MP): o acesso segue até pago_ate (+ carência); sem novas cobranças.
export async function marcarCancelada(admin: SupabaseClient, preapprovalId: string) {
  const { data, error } = await admin.from("empresas").update({ mp_preapproval_id: null })
    .eq("mp_preapproval_id", preapprovalId).select("id, plano_status, forma_assinatura").maybeSingle();
  if (error) throw new Error(`cancelar assinatura: ${error.message}`);
  if (data?.plano_status === "ativo" && data.forma_assinatura === "cartao") {
    const { error: e2 } = await admin.from("empresas").update({ plano_status: "cancelado" }).eq("id", data.id);
    if (e2) throw new Error(`cancelar assinatura: ${e2.message}`);
  }
}
// Cobrança do cartão. Empresa: pelo pagamento já gravado (vale depois de cancelar), pela assinatura ou pelo external_reference.
async function processarAutorizado(admin: SupabaseClient, a: AuthorizedPayment) {
  const mpId = String(a.id);
  const { data: salvo } = await admin.from("pagamentos").select("empresa_id").eq("mp_id", mpId).maybeSingle();
  const { data: e } = !salvo && a.preapproval_id
    ? await admin.from("empresas").select("id").eq("mp_preapproval_id", a.preapproval_id).maybeSingle()
    : { data: null };
  const empresaId = salvo?.empresa_id ?? e?.id ?? a.external_reference;
  if (!empresaId) throw new Error(`authorized_payment ${mpId} sem empresa`);
  const status = statusPagamento(a.payment?.status ?? (a.status === "cancelled" ? "cancelled" : undefined));
  await registrar(admin, empresaId, "cartao", mpId, status, a.transaction_amount, a);
}

// Busca o recurso na API do MP (nunca confia no corpo da notificação) e aplica as regras. Idempotente.
export async function processarRecurso(admin: SupabaseClient, tipo: string, id: string) {
  if (!id) return;
  if (tipo === "payment") {
    const p = await buscarPayment(id);
    // Cobranças do cartão chegam como subscription_authorized_payment; aqui só o Pix avulso.
    if (!p.external_reference?.startsWith("pix:")) return;
    await registrar(admin, p.external_reference.slice(4), "pix", String(p.id), statusPagamento(p.status), p.transaction_amount, p);
  } else if (tipo === "subscription_authorized_payment") {
    await processarAutorizado(admin, await buscarAuthorizedPayment(id));
  } else if (tipo === "subscription_preapproval") {
    const p = await buscarPreapproval(id);
    if (p.status === "cancelled") await marcarCancelada(admin, p.id);
  }
}

// Reconciliação (rotina diária): reconsulta no MP o que pode ter mudado sem webhook (pendentes, estornos,
// cobranças e cancelamentos de assinatura). Erro num item não para os outros. Devolve as falhas.
export async function reconciliar(admin: SupabaseClient) {
  const erros: string[] = [];
  const tentar = async (rotulo: string, f: () => Promise<unknown>) => {
    try {
      await f();
    } catch (e) {
      console.error("assinatura reconciliar:", rotulo, e);
      erros.push(rotulo);
      Sentry.captureException(e, { tags: { rota: "assinatura-reconciliar" }, extra: { rotulo } });
    }
  };

  const { data: recentes, error } = await admin.from("pagamentos").select("mp_id, tipo")
    .in("status", ["pendente", "aprovado"]).gte("created_at", new Date(Date.now() - 35 * 86_400_000).toISOString());
  if (error) throw new Error(`reconciliar pagamentos: ${error.message}`);
  for (const p of recentes ?? []) {
    await tentar(`pagamento ${p.mp_id}`, () =>
      processarRecurso(admin, p.tipo === "pix" ? "payment" : "subscription_authorized_payment", p.mp_id));
  }

  const { data: assinaturas, error: erroAss } = await admin.from("empresas").select("mp_preapproval_id")
    .not("mp_preapproval_id", "is", null);
  if (erroAss) throw new Error(`reconciliar assinaturas: ${erroAss.message}`);
  for (const { mp_preapproval_id: id } of assinaturas ?? []) {
    await tentar(`assinatura ${id}`, async () => {
      for (const a of await buscarCobrancasAssinatura(id)) await processarAutorizado(admin, a);
      await processarRecurso(admin, "subscription_preapproval", id);
    });
  }
  return erros;
}
