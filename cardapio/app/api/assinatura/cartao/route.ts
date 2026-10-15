import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { donoLogado } from "@/lib/assinatura";
import { cancelarAssinatura, criarAssinaturaCartao } from "@/lib/mercadopago";
import { cartaoAtivo } from "@/lib/planos";
import { createAdminClient } from "@/lib/supabase/server";

const erro = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });

// Cria a assinatura mensal no MP e devolve o link do checkout (o dono informa o cartão lá).
export async function POST(request: Request) {
  const dono = await donoLogado();
  if (!dono) return erro("Sem permissão", 403);
  const { empresa, email } = dono;
  if (empresa.cortesia) return erro("Sua loja tem acesso cortesia: não precisa assinar.", 409);
  if (cartaoAtivo(empresa)) return erro("Você já tem uma assinatura ativa no cartão.", 409);
  try {
    // Checkout anterior abandonado: cancela para não ficar uma segunda assinatura pendente no MP.
    if (empresa.mp_preapproval_id) await cancelarAssinatura(empresa.mp_preapproval_id).catch(() => {});
    const url = await criarAssinaturaCartao(createAdminClient(), empresa, email, new URL(request.url).origin);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("assinatura cartão:", e);
    Sentry.captureException(e, { tags: { rota: "assinatura-cartao" } });
    return erro("Não foi possível abrir o pagamento no Mercado Pago. Tente de novo.", 502);
  }
}
