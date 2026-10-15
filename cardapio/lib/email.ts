// E-mails da assinatura via Resend (server only, RESEND_API_KEY).
import { PRODUTO, SITE_URL } from "@/lib/marca";
import type { AvisoRotina } from "@/lib/planos";

export type TipoEmail = AvisoRotina | "recusado" | "boas_vindas";

const TEXTOS: Record<TipoEmail, { assunto: string; texto: (loja: string, data: string) => string }> = {
  pix_3d: {
    assunto: "Seu plano vence em 3 dias",
    texto: (loja, data) => `O período pago de ${loja} vai até ${data}. Gere um novo Pix de 30 dias para o cardápio continuar no ar sem interrupção.`,
  },
  pix_hoje: {
    assunto: "Seu plano vence hoje",
    texto: (loja, data) => `O período pago de ${loja} termina hoje (${data}). Pague o Pix de 30 dias para continuar recebendo pedidos.`,
  },
  trial_3d: {
    assunto: "Seu teste grátis termina em 3 dias",
    texto: (loja, data) => `O teste grátis de ${loja} vai até ${data}. Assine no cartão ou pague 30 dias no Pix para não perder nenhum pedido.`,
  },
  trial_hoje: {
    assunto: "Seu teste grátis termina hoje",
    texto: (loja, data) => `O teste grátis de ${loja} termina hoje (${data}). Assine agora para o cardápio continuar disponível para os clientes.`,
  },
  recusado: {
    assunto: "Não conseguimos cobrar sua assinatura",
    texto: (loja) => `O pagamento da mensalidade de ${loja} foi recusado pelo cartão. Confira o cartão ou pague 30 dias no Pix para manter a loja no ar.`,
  },
  boas_vindas: {
    assunto: `Bem-vindo ao ${PRODUTO}!`,
    texto: (loja, data) => `Recebemos o pagamento de ${loja}. Sua assinatura está ativa até ${data}. Obrigado pela confiança!`,
  },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function enviarEmail(para: string, tipo: TipoEmail, loja: string, data: string, idempotencia: string) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) throw new Error("RESEND_API_KEY não configurado");
  const { assunto, texto } = TEXTOS[tipo];
  const corpo = texto(loja, data);
  const link = `${SITE_URL}/painel?secao=assinatura`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#171717">
<h1 style="font-size:20px">${esc(assunto)}</h1>
<p style="font-size:15px;line-height:1.5">${esc(corpo)}</p>
<p style="margin:28px 0"><a href="${link}" style="background:#059669;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Ver minha assinatura</a></p>
<p style="font-size:12px;color:#737373">${esc(PRODUTO)} · este e-mail é automático, não responda.</p>
</div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json", "Idempotency-Key": idempotencia },
    body: JSON.stringify({
      from: `${PRODUTO} <nao-responda@ascentstudio.com.br>`, to: [para], subject: assunto, html,
      text: `${corpo}\n\nVer minha assinatura: ${link}`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}
