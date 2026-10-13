// Marca e contato comercial: trocar aqui.
export const PRODUTO = "Ascent Cardápio";
export const DOMINIO = "cardapio.ascentstudio.com.br";
export const SITE_URL = `https://${DOMINIO}`;
// WhatsApp de vendas com DDI + DDD, só dígitos.
export const WHATSAPP_VENDAS = "5566992402445";

export const linkVendas = (mensagem = `Olá! Quero saber mais sobre o ${PRODUTO}.`) =>
  `https://wa.me/${WHATSAPP_VENDAS}?text=${encodeURIComponent(mensagem)}`;
