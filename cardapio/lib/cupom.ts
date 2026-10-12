import { brl, type StatusPedido } from "./tipos";

export type PedidoBalcao = {
  id: string; numero: number; tipo: "mesa" | "entrega" | "retirada"; status: StatusPedido;
  cliente_nome: string | null; cliente_telefone: string | null; endereco: string | null; bairro_nome: string | null;
  taxa_entrega: number; subtotal: number; total: number; observacao: string | null;
  impresso_em: string | null; created_at: string; comanda_id: string | null;
  pedido_itens: { nome: string; preco: number; quantidade: number; observacao: string | null }[];
  comandas: { mesas: { numero: number } | null } | null;
  membros: { nome: string } | null;
};

export const SELECT_PEDIDO =
  "id, numero, tipo, status, cliente_nome, cliente_telefone, endereco, bairro_nome, taxa_entrega, subtotal, total, " +
  "observacao, impresso_em, created_at, comanda_id, pedido_itens(nome, preco, quantidade, observacao), " +
  "comandas(mesas(numero)), membros(nome)";

// Todo texto vem de cliente/garçom: escapar sempre (o cupom é HTML).
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const linha = (a: string, b: string, cls = "") => `<div class="l ${cls}"><span>${a}</span><span>${b}</span></div>`;

function documento(corpo: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 80mm auto; margin: 0 }
* { box-sizing: border-box }
body { width: 72mm; margin: 0 auto; padding: 3mm 0 8mm; font: 12px/1.35 "Courier New", monospace; color: #000 }
h1 { font-size: 15px; text-align: center; margin: 0 0 2px }
p { margin: 0 }
.c { text-align: center } .g { font-size: 22px; font-weight: bold } .t { font-size: 15px; font-weight: bold }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0 }
.l { display: flex; justify-content: space-between; gap: 8px }
.obs { font-weight: bold; font-size: 14px; border: 2px solid #000; padding: 2px 4px; margin: 2px 0 4px 10px }
</style></head><body>${corpo}</body></html>`;
}

function itens(p: PedidoBalcao) {
  return p.pedido_itens
    .map((i) => linha(`${i.quantidade}x ${esc(i.nome)}`, brl(i.preco * i.quantidade)) +
      (i.observacao ? `<div class="obs">» ${esc(i.observacao)}</div>` : ""))
    .join("");
}

export function cupomPedido(empresa: string, p: PedidoBalcao) {
  const cabecalho =
    p.tipo === "mesa"
      ? `<p class="c t">MESA ${p.comandas?.mesas?.numero ?? "?"}</p>${p.membros ? `<p>Garçom: ${esc(p.membros.nome)}</p>` : ""}`
      : `<p class="c t">${p.tipo === "entrega" ? "ENTREGA" : "RETIRADA"}</p>` +
        `<p>Cliente: ${esc(p.cliente_nome)}</p><p>Tel: ${esc(p.cliente_telefone)}</p>` +
        (p.tipo === "entrega" ? `<p>End.: ${esc(p.endereco)}</p><p>Bairro: ${esc(p.bairro_nome)}</p>` : "");
  return documento(
    `<h1>${esc(empresa)}</h1><p class="c">${hora(p.created_at)}</p><hr>` +
    `<p class="c g">PEDIDO #${p.numero}</p>${cabecalho}<hr>${itens(p)}` +
    (p.observacao ? `<hr><div class="obs">OBS: ${esc(p.observacao)}</div>` : "") +
    `<hr>${linha("Subtotal", brl(p.subtotal))}` +
    (p.tipo === "entrega" ? linha("Taxa entrega", brl(p.taxa_entrega)) : "") +
    linha("TOTAL", brl(p.total), "t"),
  );
}

// Pré-conta da mesa: todos os pedidos não cancelados da comanda.
export function preConta(empresa: string, mesa: number, pedidos: PedidoBalcao[]) {
  const validos = pedidos.filter((p) => p.status !== "cancelado");
  const total = validos.reduce((s, p) => s + Number(p.total), 0);
  return documento(
    `<h1>${esc(empresa)}</h1><p class="c">${hora(new Date().toISOString())}</p><hr>` +
    `<p class="c g">MESA ${mesa}</p><p class="c">CONFERÊNCIA DE CONTA</p><hr>` +
    validos.map((p) => `<p>Pedido #${p.numero} · ${hora(p.created_at)}</p>${itens(p)}`).join("<hr>") +
    `<hr>${linha("TOTAL", brl(total), "t")}<hr><p class="c">Não é documento fiscal</p>`,
  );
}
