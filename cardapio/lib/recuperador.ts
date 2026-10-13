export const FIM_OFERTA = "Responda SAIR para não receber ofertas.";

export type Oferta = "percentual" | "valor" | "frete_gratis";
export type ConfigRecuperador = {
  empresa_id: string;
  ativo: boolean;
  dias_sem_comprar: number;
  tipo_oferta: Oferta;
  valor_oferta: number;
  pedido_minimo: number;
  validade_dias: number;
  intervalo_dias: number;
  limite_dia: number;
  janela_inicio: string;
  janela_fim: string;
  mensagem: string | null;
};

export const CONFIG_RECUPERADOR_PADRAO = {
  ativo: false,
  dias_sem_comprar: 10,
  tipo_oferta: "percentual" as Oferta,
  valor_oferta: 15,
  pedido_minimo: 0,
  validade_dias: 5,
  intervalo_dias: 30,
  limite_dia: 20,
  janela_inicio: "10:00",
  janela_fim: "20:00",
  mensagem: "Oi, {cliente}! Faz um tempinho que você não pede no {empresa}. Temos {oferta} para você: use o cupom {cupom} até {validade}. Peça aqui: {link_cardapio}",
};

export function montarMensagem(template: string, variaveis: Record<string, string>) {
  const texto = template.replace(/\{(cliente|empresa|oferta|cupom|validade|link_cardapio)\}/g,
    (completo, chave: string) => variaveis[chave] ?? completo).trim();
  return texto.endsWith(FIM_OFERTA) ? texto : `${texto}\n\n${FIM_OFERTA}`;
}

export function textoOferta(tipo: Oferta, valor: number) {
  if (tipo === "frete_gratis") return "frete grátis";
  if (tipo === "percentual") return `${Number(valor)}% de desconto`;
  return `R$ ${Number(valor).toFixed(2).replace(".", ",")} de desconto`;
}
