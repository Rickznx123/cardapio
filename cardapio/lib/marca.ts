// Marca e contato comercial: trocar aqui.
export const PRODUTO = "Ascent Cardápio";
export const DOMINIO = "cardapio.SEUDOMINIO.com.br";
export const SITE_URL = `https://${DOMINIO}`;
// WhatsApp de vendas com DDI + DDD, só dígitos. TROCAR pelo número real.
export const WHATSAPP_VENDAS = "5566000000000";

export const linkVendas = (mensagem = `Olá! Quero saber mais sobre o ${PRODUTO}.`) =>
  `https://wa.me/${WHATSAPP_VENDAS}?text=${encodeURIComponent(mensagem)}`;
