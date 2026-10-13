import { ImageResponse } from "next/og";
import { PRODUTO } from "@/lib/marca";
import { PRECO_MENSAL } from "@/lib/planos";
import { brl } from "@/lib/tipos";

// Imagem de compartilhamento só da landing (fica no grupo (site), não vale para os cardápios das lojas).
export const alt = `${PRODUTO}: cardápio digital sem taxa por pedido`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Imagem() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#e11d48", color: "white" }}>
        <div style={{ fontSize: 36, fontWeight: 700, opacity: 0.9 }}>{PRODUTO}</div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.1, marginTop: 24 }}>Receba pedidos online sem pagar taxa por pedido</div>
        <div style={{ fontSize: 34, marginTop: 32, opacity: 0.9 }}>{`Cardápio digital, delivery, mesas e WhatsApp · ${brl(PRECO_MENSAL)}/mês`}</div>
      </div>
    ),
    size,
  );
}
