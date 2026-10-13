import { DIAS, type Horarios, temHorarios, textoDia } from "@/lib/horarios";
import { brl, textoTempo } from "@/lib/tipos";

// Textos do bot (bot_mensagens.tipo). Compartilhado entre painel e server: nada de segredo aqui.
export const TIPOS = {
  boas_vindas: {
    nome: "Boas-vindas",
    padrao: "Olá, {cliente}! 👋 Bem-vindo(a) ao *{empresa}*.\n\nComo posso ajudar? Responda com o número:\n1️⃣ Fazer pedido\n2️⃣ Horários\n3️⃣ Informações\n4️⃣ Promoções",
  },
  fazer_pedido: { nome: "1 · Fazer pedido", padrao: "Faça seu pedido pelo nosso cardápio digital, é rapidinho: {link_cardapio} 🛒" },
  horarios: { nome: "2 · Horários", padrao: "🕒 Nossos horários:\n{horarios}" },
  informacoes: {
    nome: "3 · Informações",
    padrao: "ℹ️ *{empresa}*\nTempo de entrega: {tempo_entrega}\nCardápio, taxas e formas de pagamento: {link_cardapio}",
  },
  promocoes: { nome: "4 · Promoções", padrao: "🔥 Confira os destaques e promoções no cardápio: {link_cardapio}" },
  ausencia: {
    nome: "Ausência (loja fechada)",
    padrao: "Olá, {cliente}! No momento estamos fechados. 😴\n\nNossos horários:\n{horarios}\n\nO cardápio fica em {link_cardapio}",
  },
  pedido_recebido: {
    nome: "Pedido recebido",
    padrao: "Oi, {cliente}! Recebemos seu pedido *#{numero_pedido}* de {total}. ✅\nAcompanhe por aqui: {link_pedido}",
  },
  pedido_preparo: { nome: "Pedido em preparo", padrao: "Seu pedido *#{numero_pedido}* já está sendo preparado! 👨‍🍳" },
  pedido_saiu: { nome: "Saiu para entrega", padrao: "Seu pedido *#{numero_pedido}* saiu para entrega! 🛵 Logo chega aí." },
  pedido_pronto_retirada: { nome: "Pronto para retirada", padrao: "Seu pedido *#{numero_pedido}* está pronto para retirada! 🛍️" },
  pedido_cancelado: {
    nome: "Pedido cancelado",
    padrao: "Seu pedido *#{numero_pedido}* foi cancelado. Se tiver alguma dúvida, é só responder esta mensagem.",
  },
} as const;
export type TipoMensagem = keyof typeof TIPOS;

export const VARIAVEIS = [
  "cliente", "empresa", "link_cardapio", "numero_pedido", "total", "horarios", "tempo_entrega", "link_pedido",
] as const;
export type Variaveis = Partial<Record<(typeof VARIAVEIS)[number], string>>;

// Troca {variavel} pelo valor; variável sem valor some (não deixa "{cliente}" na mensagem).
export const preencher = (texto: string, v: Variaveis) =>
  texto.replace(/\{(\w+)\}/g, (todo, k: string) => (VARIAVEIS.includes(k as never) ? v[k as keyof Variaveis] ?? "" : todo));

export function textoHorarios(h: Horarios | null, livre: string | null) {
  if (!h || !temHorarios(h)) return livre || "Consulte no cardápio";
  return DIAS.map(([d, nome]) => `${nome}: ${textoDia(h[d]).replace("Fechado", "fechado")}`).join("\n");
}

type EmpresaVars = {
  nome: string; slug: string; horarios: Horarios | null; horario_texto: string | null;
  tempo_entrega_min: number | null; tempo_entrega_max: number | null;
};
export const variaveisEmpresa = (e: EmpresaVars, origem: string): Variaveis => ({
  empresa: e.nome,
  link_cardapio: `${origem}/${e.slug}`,
  horarios: textoHorarios(e.horarios, e.horario_texto),
  tempo_entrega: textoTempo(e.tempo_entrega_min, e.tempo_entrega_max) ?? "a combinar",
});

export const variaveisPedido = (p: { id: string; numero: number; total: number; cliente_nome: string | null }, slug: string, origem: string): Variaveis => ({
  cliente: p.cliente_nome?.split(" ")[0] ?? "",
  numero_pedido: String(p.numero),
  total: brl(p.total),
  link_pedido: `${origem}/${slug}/pedido/${p.id}`,
});
