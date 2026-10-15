import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { donoLogado } from "@/lib/assinatura";
import { criarPix30 } from "@/lib/mercadopago";
import { cartaoAtivo } from "@/lib/planos";
import { createAdminClient } from "@/lib/supabase/server";

const erro = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });

// Gera um Pix de 30 dias: devolve id, copia e cola e QR (base64).
export async function POST(request: Request) {
  const dono = await donoLogado();
  if (!dono) return erro("Sem permissão", 403);
  const { empresa, email } = dono;
  if (empresa.cortesia) return erro("Sua loja tem acesso cortesia: não precisa pagar.", 409);
  if (cartaoAtivo(empresa)) return erro("Você já paga no cartão. Cancele a assinatura antes de pagar no Pix.", 409);
  try {
    return NextResponse.json(await criarPix30(createAdminClient(), empresa, email, new URL(request.url).origin));
  } catch (e) {
    console.error("assinatura pix:", e);
    Sentry.captureException(e, { tags: { rota: "assinatura-pix" } });
    return erro("Não foi possível gerar o Pix. Tente de novo.", 502);
  }
}
