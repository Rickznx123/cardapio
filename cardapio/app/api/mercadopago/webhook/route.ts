import { NextResponse } from "next/server";
import { verificarAssinaturaMercadoPago } from "@/lib/mercadopago";

export async function POST(request: Request) {
  const secret = process.env.MP_WEBHOOK_SECRET ?? "";
  const body = await request.text();
  const signature = request.headers.get("x-signature");

  if (!secret || !verificarAssinaturaMercadoPago(body, signature, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body || "{}");
    const mpId = String(payload?.data?.id ?? payload?.id ?? "");
    if (!mpId) return NextResponse.json({ ok: true });
    // O processamento real fica no backend do Mercado Pago/API do app. Aqui só validamos e confirmamos.
    return NextResponse.json({ ok: true, mp_id: mpId });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
