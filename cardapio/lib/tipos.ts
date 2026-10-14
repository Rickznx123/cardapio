export type FormaPagamento = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito";
export const FORMAS: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Cartão de crédito", cartao_debito: "Cartão de débito",
};

export const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const TODAS_FORMAS = Object.keys(FORMAS) as FormaPagamento[];

// Horários por dia da semana (empresas.horarios): ver lib/horarios.ts.
import type { Horarios } from "./horarios.ts";
export { DIAS, type Dia, type Horarios, type Turno } from "./horarios.ts";

// Tempo estimado em texto: "30–45 min", "~20 min" ou null.
export function textoTempo(min: number | null, max?: number | null) {
  if (min == null && max == null) return null;
  if (min != null && max != null && max !== min) return `${min}–${max} min`;
  return `~${min ?? max} min`;
}

export type EmpresaPublica = {
  id: string; nome: string; slug: string; logo_url: string | null; cor_primaria: string | null;
  whatsapp: string | null; endereco: string | null;
  capa_url: string | null; descricao: string | null; horario_texto: string | null;
  aceita_entrega: boolean; aceita_retirada: boolean;
  formas_pagamento: FormaPagamento[];
  tempo_entrega_min: number | null; tempo_entrega_max: number | null; tempo_retirada: number | null;
  horarios: Horarios | null;
};
export type CategoriaPublica = { id: string; nome: string };
export type ItemPublico = {
  id: string; categoria_id: string; nome: string; descricao: string | null;
  preco: number; foto_url: string | null; disponivel: boolean; destaque?: boolean;
  ponto_carne_ativo?: boolean; ponto_carne_opcoes?: string[]; ponto_carne_obrigatorio?: boolean;
};
export type BairroPublico = { id: string; nome: string; taxa: number; pedido_minimo: number };

// Retorno da RPC ver_pedido_publico (sem telefone/endereço).
export type StatusPedido = "novo" | "aguardando_aceite" | "preparo" | "pronto" | "saiu" | "entregue" | "cancelado";
export const STATUS: Record<StatusPedido, string> = {
  novo: "Recebido", aguardando_aceite: "Aguardando confirmação", preparo: "Em preparo", pronto: "Pronto",
  saiu: "Saiu para entrega", entregue: "Entregue", cancelado: "Cancelado",
};
export type PedidoPublico = {
  numero: number; tipo: "entrega" | "retirada"; status: StatusPedido; bairro_nome: string | null;
  taxa: number; subtotal: number; total: number; created_at: string;
  forma_pagamento: FormaPagamento | null; troco_para: number | null; pago: boolean;
  desconto: number; cupom: string | null;
  itens: { nome: string; preco: number; quantidade: number; observacao: string | null; ponto_carne?: string | null }[];
};
