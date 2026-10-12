import { brl, FORMAS, type FormaPagamento, type StatusPedido, TODAS_FORMAS } from "./tipos";

export type PedidoBalcao = {
  id: string; numero: number; tipo: "mesa" | "entrega" | "retirada"; status: StatusPedido;
  cliente_nome: string | null; cliente_telefone: string | null; endereco: string | null; bairro_nome: string | null;
  taxa_entrega: number; subtotal: number; total: number; observacao: string | null;
  impresso_em: string | null; created_at: string; comanda_id: string | null;
  forma_pagamento: FormaPagamento | null; troco_para: number | null; pago: boolean; pago_em: string | null;
  origem: "web" | "garcom" | "balcao";
  pedido_itens: { nome: string; preco: number; quantidade: number; observacao: string | null }[];
  comandas: { mesas: { numero: number } | null } | null;
  membros: { nome: string } | null;
};

export const SELECT_PEDIDO =
  "id, numero, tipo, status, cliente_nome, cliente_telefone, endereco, bairro_nome, taxa_entrega, subtotal, total, " +
  "observacao, impresso_em, created_at, comanda_id, forma_pagamento, troco_para, pago, pago_em, origem, pedido_itens(nome, preco, quantidade, observacao), " +
  "comandas(mesas(numero)), membros(nome)";

export const ORIGEM: Record<PedidoBalcao["origem"], string> = { web: "WEB", garcom: "GARÇOM", balcao: "BALCÃO" };

// empresas.config_impressao
export type ConfigImpressao = {
  largura: 58 | 80; vias: number; via_cozinha_sem_precos: boolean; cabecalho: string; rodape: string;
};
export const CONFIG_PADRAO: ConfigImpressao = { largura: 80, vias: 1, via_cozinha_sem_precos: false, cabecalho: "", rodape: "" };
export const configImpressao = (c: Partial<ConfigImpressao> | null | undefined): ConfigImpressao => ({ ...CONFIG_PADRAO, ...(c ?? {}) });

// Todo texto vem de cliente/garçom/dono: escapar sempre (o cupom é HTML).
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const linha = (a: string, b: string, cls = "") => `<div class="l ${cls}"><span>${a}</span><span>${b}</span></div>`;
const multilinha = (s: string) => s.trim() ? s.trim().split("\n").map((l) => `<p class="c">${esc(l)}</p>`).join("") : "";

function documento(corpo: string, cfg: ConfigImpressao) {
  const largura = cfg.largura === 58 ? 58 : 80;
  const fonte = largura === 58 ? 11 : 12;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${largura}mm auto; margin: 0 }
* { box-sizing: border-box }
body { width: ${largura - 8}mm; margin: 0 auto; padding: 3mm 0 8mm; font: ${fonte}px/1.35 "Courier New", monospace; color: #000 }
h1 { font-size: ${fonte + 3}px; text-align: center; margin: 0 0 2px }
p { margin: 0 }
.c { text-align: center } .g { font-size: ${fonte + 10}px; font-weight: bold } .t { font-size: ${fonte + 3}px; font-weight: bold }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0 }
.l { display: flex; justify-content: space-between; gap: 8px }
.obs { font-weight: bold; font-size: ${fonte + 2}px; border: 2px solid #000; padding: 2px 4px; margin: 2px 0 4px 10px }
</style></head><body>${corpo}</body></html>`;
}

const topo = (empresa: string, cfg: ConfigImpressao, quando: string) =>
  `<h1>${esc(empresa)}</h1>${multilinha(cfg.cabecalho)}<p class="c">${hora(quando)}</p><hr>`;
const fim = (cfg: ConfigImpressao) => (cfg.rodape.trim() ? `<hr>${multilinha(cfg.rodape)}` : "");

function itens(p: PedidoBalcao, semPrecos = false) {
  return p.pedido_itens
    .map((i) => (semPrecos
      ? `<p class="t">${i.quantidade}x ${esc(i.nome)}</p>`
      : linha(`${i.quantidade}x ${esc(i.nome)}`, brl(i.preco * i.quantidade))) +
      (i.observacao ? `<div class="obs">» ${esc(i.observacao)}</div>` : ""))
    .join("");
}

// Forma de pagamento, troco e situação: o entregador/caixa precisa ver no papel.
function pagamento(p: PedidoBalcao) {
  const forma = p.forma_pagamento ? FORMAS[p.forma_pagamento] : "A definir";
  const troco = p.troco_para != null
    ? linha("Troco para", brl(p.troco_para)) + linha("Levar de troco", brl(p.troco_para - p.total))
    : "";
  return `<hr>${linha("Pagamento", esc(forma))}${troco}<p class="c g">${p.pago ? "PAGO" : "NÃO PAGO"}</p>`;
}

export function cupomPedido(empresa: string, p: PedidoBalcao, config?: Partial<ConfigImpressao> | null, semPrecos = false) {
  const cfg = configImpressao(config);
  const cabecalho =
    p.tipo === "mesa"
      ? `<p class="c t">MESA ${p.comandas?.mesas?.numero ?? "?"}</p>${p.membros ? `<p>Garçom: ${esc(p.membros.nome)}</p>` : ""}`
      : `<p class="c t">${p.tipo === "entrega" ? "ENTREGA" : "RETIRADA"}</p>` +
        (p.cliente_nome ? `<p>Cliente: ${esc(p.cliente_nome)}</p>` : "") +
        (!semPrecos && p.cliente_telefone ? `<p>Tel: ${esc(p.cliente_telefone)}</p>` : "") +
        (!semPrecos && p.tipo === "entrega" ? `<p>End.: ${esc(p.endereco)}</p><p>Bairro: ${esc(p.bairro_nome)}</p>` : "");
  return documento(
    topo(empresa, cfg, p.created_at) +
    (semPrecos ? `<p class="c t">*** COZINHA ***</p>` : "") +
    `<p class="c g">PEDIDO #${p.numero}</p><p class="c">${ORIGEM[p.origem] ?? ""}</p>${cabecalho}<hr>${itens(p, semPrecos)}` +
    (p.observacao ? `<hr><div class="obs">OBS: ${esc(p.observacao)}</div>` : "") +
    (semPrecos ? "" :
      `<hr>${linha("Subtotal", brl(p.subtotal))}` +
      (p.tipo === "entrega" ? linha("Taxa entrega", brl(p.taxa_entrega)) : "") +
      linha("TOTAL", brl(p.total), "t") +
      pagamento(p) + fim(cfg)),
    cfg,
  );
}

// Todas as vias de um pedido: N vias completas + (opcional) via da cozinha sem preços.
export function cuponsPedido(empresa: string, p: PedidoBalcao, config?: Partial<ConfigImpressao> | null) {
  const cfg = configImpressao(config);
  const vias = Array.from({ length: Math.min(3, Math.max(1, cfg.vias)) }, () => cupomPedido(empresa, p, cfg));
  return cfg.via_cozinha_sem_precos ? [...vias, cupomPedido(empresa, p, cfg, true)] : vias;
}

// Pré-conta da mesa: todos os pedidos não cancelados da comanda.
export function preConta(empresa: string, mesa: number, pedidos: PedidoBalcao[], config?: Partial<ConfigImpressao> | null) {
  const cfg = configImpressao(config);
  const validos = pedidos.filter((p) => p.status !== "cancelado");
  const total = validos.reduce((s, p) => s + Number(p.total), 0);
  return documento(
    topo(empresa, cfg, new Date().toISOString()) +
    `<p class="c g">MESA ${mesa}</p><p class="c">CONFERÊNCIA DE CONTA</p><hr>` +
    validos.map((p) => `<p>Pedido #${p.numero} · ${hora(p.created_at)}</p>${itens(p)}`).join("<hr>") +
    `<hr>${linha("TOTAL", brl(total), "t")}<hr><p class="c">Não é documento fiscal</p>` + fim(cfg),
    cfg,
  );
}

// Retorno de resumo_caixa / fechar_caixa.
export type ResumoCaixa = {
  caixa: { id: string; status: "aberto" | "fechado"; aberto_em: string; fechado_em: string | null; valor_inicial: number;
    valores_informados: Partial<Record<FormaPagamento, number>> | null; observacao: string | null };
  aberto_por_nome: string | null; fechado_por_nome: string | null;
  entradas: Partial<Record<FormaPagamento | "a_definir", number>>; qtd_pedidos: number; total_vendas: number;
  sangrias: number; suprimentos: number; esperado: Record<FormaPagamento, number>;
  movimentos: { id: string; tipo: "sangria" | "suprimento"; valor: number; motivo: string | null; created_at: string; membro: string | null }[];
};

// Resumo de fechamento de caixa (80/58mm): esperado × contado por forma.
export function cupomFechamento(empresa: string, r: ResumoCaixa, config?: Partial<ConfigImpressao> | null) {
  const cfg = configImpressao(config);
  const inf = r.caixa.valores_informados ?? {};
  const formas = TODAS_FORMAS.filter((f) => Number(r.esperado[f]) || inf[f] != null);
  return documento(
    topo(empresa, cfg, r.caixa.fechado_em ?? new Date().toISOString()) +
    `<p class="c t">FECHAMENTO DE CAIXA</p>` +
    `<p>Abertura: ${hora(r.caixa.aberto_em)}${r.aberto_por_nome ? ` (${esc(r.aberto_por_nome)})` : ""}</p>` +
    (r.caixa.fechado_em ? `<p>Fechamento: ${hora(r.caixa.fechado_em)}${r.fechado_por_nome ? ` (${esc(r.fechado_por_nome)})` : ""}</p>` : "") +
    `<hr>${linha("Valor inicial", brl(r.caixa.valor_inicial))}${linha("Vendas", brl(r.total_vendas))}` +
    linha("Pedidos", String(r.qtd_pedidos)) + linha("Suprimentos", brl(r.suprimentos)) + linha("Sangrias", `-${brl(r.sangrias)}`) +
    `<hr><p class="t">ESPERADO × CONTADO</p>` +
    formas.map((f) => {
      const esperado = Number(r.esperado[f] ?? 0);
      const contado = Number(inf[f] ?? 0);
      const dif = contado - esperado;
      return `<p><b>${FORMAS[f]}</b></p>${linha("Esperado", brl(esperado))}${linha("Contado", brl(contado))}` +
        linha("Diferença", `${dif > 0 ? "+" : ""}${brl(dif)}`, Math.abs(dif) >= 0.01 ? "t" : "");
    }).join("") +
    (r.caixa.observacao ? `<hr><div class="obs">OBS: ${esc(r.caixa.observacao)}</div>` : "") +
    `<hr><p class="c">Assinatura: ____________________</p>` + fim(cfg),
    cfg,
  );
}
