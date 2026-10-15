// Mercado Pago: API (server only, MP_ACCESS_TOKEN) + validação do webhook. Sem imports com "@/": roda no `node --test`.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRECO_MENSAL } from "./planos.ts";

export type FormaAssinatura = "cartao" | "pix";
export type StatusPagamento = "pendente" | "aprovado" | "recusado" | "cancelado" | "estornado";
type EmpresaMP = { id: string; nome: string };

// Padrão oficial: manifest "id:{data.id};request-id:{x-request-id};ts:{ts};" assinado com HMAC-SHA256 (hex) = v1.
// Partes ausentes saem do manifest; data.id alfanumérico vai em minúsculas.
export function verificarAssinaturaMercadoPago(
  { xSignature, xRequestId, dataId }: { xSignature: string | null; xRequestId: string | null; dataId: string | null },
  secret: string,
) {
  if (!xSignature || !secret) return false;
  const partes = Object.fromEntries(xSignature.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const { ts, v1 } = partes;
  if (!ts || !v1 || !/^[0-9a-f]+$/i.test(v1)) return false;
  const manifest = (dataId ? `id:${dataId.toLowerCase()};` : "") + (xRequestId ? `request-id:${xRequestId};` : "") + `ts:${ts};`;
  const esperado = createHmac("sha256", secret).update(manifest).digest();
  const recebido = Buffer.from(v1, "hex");
  return recebido.length === esperado.length && timingSafeEqual(esperado, recebido);
}

// Status do MP → nosso. Pagamento de assinatura (authorized_payment) usa o status do payment interno quando existe.
export function statusPagamento(mp: string | undefined): StatusPagamento {
  if (mp === "approved") return "aprovado";
  if (mp === "rejected") return "recusado";
  if (mp === "cancelled") return "cancelado";
  if (mp === "refunded" || mp === "charged_back") return "estornado";
  return "pendente";
}

async function mp<T>(caminho: string, init: { method?: string; body?: object; idempotencia?: string } = {}): Promise<T> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("MP_ACCESS_TOKEN não configurado");
  const r = await fetch(`https://api.mercadopago.com${caminho}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      ...(init.idempotencia ? { "X-Idempotency-Key": init.idempotencia } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Pago ${init.method ?? "GET"} ${caminho}: ${r.status} ${JSON.stringify(dados).slice(0, 500)}`);
  return dados as T;
}

export type Preapproval = { id: string; status: string; init_point?: string; external_reference?: string };
export type Payment = {
  id: number; status: string; transaction_amount: number; external_reference?: string;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
};
export type AuthorizedPayment = {
  id: number | string; status: string; transaction_amount: number; preapproval_id?: string; external_reference?: string;
  payment?: { id?: number; status?: string; status_detail?: string };
};

export const buscarPayment = (id: string) => mp<Payment>(`/v1/payments/${encodeURIComponent(id)}`);
export const buscarPreapproval = (id: string) => mp<Preapproval>(`/preapproval/${encodeURIComponent(id)}`);
export const buscarAuthorizedPayment = (id: string) => mp<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`);
// shortcut: só a primeira página (até 100 cobranças por assinatura); paginar se alguma assinatura passar disso.
export const buscarCobrancasAssinatura = async (preapprovalId: string) =>
  (await mp<{ results?: AuthorizedPayment[] }>(`/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}&limit=100`)).results ?? [];

// Assinatura mensal sem plano, pendente: o dono informa o cartão no checkout do MP (init_point).
export async function criarAssinaturaCartao(
  admin: SupabaseClient, empresa: EmpresaMP, payerEmail: string, origem: string,
) {
  const p = await mp<Preapproval>("/preapproval", {
    method: "POST",
    body: {
      reason: `Ascent Cardápio · ${empresa.nome}`,
      external_reference: empresa.id,
      payer_email: payerEmail,
      back_url: `${origem}/painel/assinatura`,
      status: "pending",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: PRECO_MENSAL, currency_id: "BRL" },
    },
  });
  const { error } = await admin.from("empresas").update({ mp_preapproval_id: p.id }).eq("id", empresa.id);
  if (error) throw new Error(`Salvar preapproval: ${error.message}`);
  return p.init_point!;
}

// Pix avulso de 30 dias. Fica registrado como pendente; o webhook (ou a checagem de status) aprova.
export async function criarPix30(admin: SupabaseClient, empresa: EmpresaMP, payerEmail: string, origem: string) {
  const p = await mp<Payment>("/v1/payments", {
    method: "POST",
    idempotencia: crypto.randomUUID(),
    body: {
      transaction_amount: PRECO_MENSAL,
      description: `Ascent Cardápio · 30 dias · ${empresa.nome}`,
      payment_method_id: "pix",
      external_reference: `pix:${empresa.id}`,
      notification_url: `${origem}/api/mercadopago/webhook`,
      payer: { email: payerEmail },
    },
  });
  const { error } = await admin.rpc("registrar_pagamento_mp", {
    p_empresa: empresa.id, p_tipo: "pix", p_mp_id: String(p.id), p_status: statusPagamento(p.status),
    p_valor: p.transaction_amount, p_raw: p,
  });
  if (error) throw new Error(`Registrar Pix: ${error.message}`);
  const t = p.point_of_interaction?.transaction_data;
  return { id: String(p.id), qr_code: t?.qr_code ?? "", qr_code_base64: t?.qr_code_base64 ?? "" };
}

export const cancelarAssinatura = (preapprovalId: string) =>
  mp<Preapproval>(`/preapproval/${encodeURIComponent(preapprovalId)}`, { method: "PUT", body: { status: "cancelled" } });
