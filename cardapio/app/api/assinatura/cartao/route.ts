import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { donoLogado, sincronizarCartao } from "@/lib/assinatura";
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

// Situação da assinatura no cartão consultada no MP (a tela chama ao voltar do checkout; não depende do webhook).
export async function GET() {
  const dono = await donoLogado();
  if (!dono) return erro("Sem permissão", 403);
  const id = dono.empresa.mp_preapproval_id;
  if (!id) return NextResponse.json({ status: null, ativo: false });
  try {
    const admin = createAdminClient();
    const { status } = await sincronizarCartao(admin, id);
    const { data: e } = await admin.from("empresas")
      .select("plano_status, forma_assinatura, mp_preapproval_id").eq("id", dono.empresa.id).single();
    return NextResponse.json({ status, ativo: !!e && cartaoAtivo(e) });
  } catch (e) {
    console.error("assinatura cartão status:", e);
    Sentry.captureException(e, { tags: { rota: "assinatura-cartao-status" } });
    return erro("Não foi possível consultar o Mercado Pago.", 502);
  }
}
