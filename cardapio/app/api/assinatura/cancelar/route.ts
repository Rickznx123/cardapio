import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { donoLogado, marcarCancelada } from "@/lib/assinatura";
import { cancelarAssinatura } from "@/lib/mercadopago";
import { createAdminClient } from "@/lib/supabase/server";

// Cancela a assinatura no cartão. O acesso continua até o fim do período já pago.
export async function POST() {
  const dono = await donoLogado();
  if (!dono) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  const id = dono.empresa.mp_preapproval_id;
  if (!id) return NextResponse.json({ erro: "Nenhuma assinatura no cartão para cancelar." }, { status: 400 });
  try {
    await cancelarAssinatura(id);
    await marcarCancelada(createAdminClient(), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("assinatura cancelar:", e);
    Sentry.captureException(e, { tags: { rota: "assinatura-cancelar" } });
    return NextResponse.json({ erro: "Não foi possível cancelar agora. Tente de novo." }, { status: 502 });
  }
}
