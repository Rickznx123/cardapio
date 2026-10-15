import * as Sentry from "@sentry/nextjs";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { avisar, dataBR, reconciliar } from "@/lib/assinatura";
import { avisoDoDia, type PlanoStatus } from "@/lib/planos";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

function autorizado(request: Request) {
  const secret = Buffer.from(process.env.CRON_SECRET ?? "");
  const recebido = Buffer.from(new URL(request.url).searchParams.get("secret") ?? "");
  return secret.length > 0 && recebido.length === secret.length && timingSafeEqual(secret, recebido);
}

type Empresa = {
  id: string; plano_status: PlanoStatus; forma_assinatura: string | null; pago_ate: string | null; trial_ate: string | null; cortesia: boolean;
};

// pg_cron diário (09:00 Cuiabá): reconcilia com o MP, vence quem passou da carência e manda lembretes de Pix e de fim do teste.
// Idempotente: e-mails por chave em emails_enviados; o vencimento é um update condicional.
export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const agora = Date.now();

  // Antes de vencer alguém: uma cobrança aprovada sem webhook ainda conta.
  let erros: string[];
  try {
    erros = await reconciliar(admin);
  } catch (e) {
    Sentry.captureException(e, { tags: { rota: "assinatura-rotina" } });
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }

  const { data: vencidas, error } = await admin.from("empresas").update({ plano_status: "vencido" })
    .eq("plano_status", "ativo").eq("cortesia", false).lt("pago_ate", new Date(agora - 3 * 86_400_000).toISOString())
    .select("id");
  if (error) {
    Sentry.captureException(error, { tags: { rota: "assinatura-rotina" } });
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const { data: empresas, error: erroLista } = await admin.from("empresas")
    .select("id, plano_status, forma_assinatura, pago_ate, trial_ate, cortesia")
    .eq("ativo", true).eq("cortesia", false)
    .or("plano_status.eq.trial,and(plano_status.eq.ativo,forma_assinatura.eq.pix)");
  if (erroLista) {
    Sentry.captureException(erroLista, { tags: { rota: "assinatura-rotina" } });
    return NextResponse.json({ erro: erroLista.message }, { status: 500 });
  }

  let enviados = 0;
  for (const e of (empresas ?? []) as Empresa[]) {
    const aviso = avisoDoDia(e, agora);
    if (!aviso) continue;
    try {
      if (await avisar(admin, e.id, aviso.chave, aviso.tipo, dataBR(aviso.vence))) enviados++;
    } catch (err) {
      console.error("assinatura rotina:", err);
      erros.push(`${e.id}: ${aviso.tipo}`);
      Sentry.captureException(err, { tags: { rota: "assinatura-rotina" } });
    }
  }
  return NextResponse.json({ ok: erros.length === 0, vencidas: vencidas?.length ?? 0, enviados, erros }, { status: erros.length ? 500 : 200 });
}
