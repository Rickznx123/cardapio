import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processarRecurso } from "@/lib/assinatura";
import { verificarAssinaturaMercadoPago } from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/server";

// Mercado Pago → aqui (configurado no painel do MP e no notification_url do Pix). Valida, responde 200 e processa no after().
export async function POST(request: Request) {
  const url = new URL(request.url);
  const corpo = await request.json().catch(() => ({}));
  const dataId = url.searchParams.get("data.id");
  const valido = verificarAssinaturaMercadoPago({
    xSignature: request.headers.get("x-signature"),
    xRequestId: request.headers.get("x-request-id"),
    dataId,
  }, process.env.MP_WEBHOOK_SECRET ?? "");
  if (!valido) return NextResponse.json({ ok: false }, { status: 401 });

  const tipo = String(corpo?.type ?? url.searchParams.get("type") ?? "");
  const id = String(dataId ?? corpo?.data?.id ?? "");
  // Roda depois da resposta: erro aqui não chega ao onRequestError, por isso o captureException.
  after(() => processarRecurso(createAdminClient(), tipo, id).catch((e) => {
    console.error("mercadopago webhook:", e);
    Sentry.captureException(e, { tags: { rota: "mercadopago-webhook" }, extra: { tipo, id } });
  }));
  return NextResponse.json({ ok: true });
}
