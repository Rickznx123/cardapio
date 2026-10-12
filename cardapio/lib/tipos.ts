export type FormaPagamento = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito";
export const FORMAS: Record<FormaPagamento, string> = {
  dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Cartão de crédito", cartao_debito: "Cartão de débito",
};

export const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type EmpresaPublica = {
  id: string; nome: string; slug: string; logo_url: string | null; cor_primaria: string | null;
  whatsapp: string | null; endereco: string | null;
  capa_url: string | null; descricao: string | null; horario_texto: string | null;
  aceita_entrega: boolean; aceita_retirada: boolean; aberto: boolean;
};
export type CategoriaPublica = { id: string; nome: string };
export type ItemPublico = {
  id: string; categoria_id: string; nome: string; descricao: string | null;
  preco: number; foto_url: string | null; disponivel: boolean;
};
export type BairroPublico = { id: string; nome: string; taxa: number; pedido_minimo: number };

// Retorno da RPC ver_pedido_publico (sem telefone/endereço).
export type StatusPedido = "novo" | "preparo" | "pronto" | "entregue" | "cancelado";
export const STATUS: Record<StatusPedido, string> = {
  novo: "Recebido", preparo: "Em preparo", pronto: "Pronto", entregue: "Entregue", cancelado: "Cancelado",
};
export type PedidoPublico = {
  numero: number; tipo: "entrega" | "retirada"; status: StatusPedido; bairro_nome: string | null;
  taxa: number; subtotal: number; total: number; created_at: string;
  forma_pagamento: FormaPagamento | null; troco_para: number | null; pago: boolean;
  itens: { nome: string; preco: number; quantidade: number; observacao: string | null }[];
};
