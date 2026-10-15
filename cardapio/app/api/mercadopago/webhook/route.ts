import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { processarRecurso } from "@/lib/assinatura";
import { ErroMP, verificarAssinaturaMercadoPago } from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/server";

// Mercado Pago → aqui (configurado no painel do MP e no notification_url do Pix). Valida e processa antes de responder:
// falha temporária (MP fora/5xx, banco) devolve 500 e o MP reenvia (idempotente); recurso inexistente (404) devolve 200.
// A rotina diária ainda reconcilia o que escapar.
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
    // Recurso inexistente (ex.: "Simular notificação" com id fictício): reenviar não adianta.
    if (e instanceof ErroMP && e.status === 404) {
      console.warn(`mercadopago webhook: ${tipo} ${id} não existe no MP, ignorado`);
      return NextResponse.json({ ok: true, ignorado: true });
    }
    console.error("mercadopago webhook:", e);
    Sentry.captureException(e, { tags: { rota: "mercadopago-webhook" }, extra: { tipo, id } });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
