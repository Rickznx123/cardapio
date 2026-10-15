import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processarRecurso } from "@/lib/assinatura";
import { verificarAssinaturaMercadoPago } from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/server";

// Mercado Pago → aqui (configurado no painel do MP e no notification_url do Pix). Valida e processa antes de responder:
// erro devolve 500 e o MP reenvia (o processamento é idempotente). A rotina diária ainda reconcilia o que escapar.
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
  try {
    await processarRecurso(createAdminClient(), tipo, id);
  } catch (e) {
    console.error("mercadopago webhook:", e);
    Sentry.captureException(e, { tags: { rota: "mercadopago-webhook" }, extra: { tipo, id } });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
