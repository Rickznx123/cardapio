import crypto from "node:crypto";

export type FormaAssinatura = "cartao" | "pix";

export function verificarAssinaturaMercadoPago(payload: string, signature: string | null, secret: string) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature.replace("v1=", ""), "hex"));
  } catch {
    return false;
  }
}

export function checkoutMercadoPagoUrl({ empresaId, tipo, returnUrl }: { empresaId: string; tipo: FormaAssinatura; returnUrl: string }) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return null;
  const params = new URLSearchParams({
    external_reference: empresaId,
    back_url: returnUrl,
    payment_method: tipo === "pix" ? "pix" : "credit_card",
    mode: "test",
  });
  return `https://sandbox.mercadopago.com.br/checkout/v1/redirect?${params.toString()}`;
}
