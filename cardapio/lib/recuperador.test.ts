import assert from "node:assert/strict";
import { test } from "node:test";
import { FIM_OFERTA, montarMensagem, textoOferta } from "./recuperador.ts";

test("preenche as variáveis e sempre inclui a frase de opt-out no fim", () => {
  const texto = montarMensagem("Oi {cliente}, {oferta} no {empresa}: {cupom} até {validade}. {link_cardapio}", {
    cliente: "Bia", empresa: "Lanchonete", oferta: "15% de desconto", cupom: "VOLTA12345",
    validade: "20/10/2026", link_cardapio: "https://exemplo.com/loja",
  });
  assert.match(texto, /^Oi Bia, 15% de desconto no Lanchonete: VOLTA12345 até 20\/10\/2026\./);
  assert.ok(texto.endsWith(FIM_OFERTA));
});

test("não duplica a frase de opt-out e formata as ofertas", () => {
  assert.equal(montarMensagem(`Texto\n${FIM_OFERTA}`, {}), `Texto\n${FIM_OFERTA}`);
  assert.equal(textoOferta("percentual", 15), "15% de desconto");
  assert.equal(textoOferta("valor", 7.5), "R$ 7,50 de desconto");
  assert.equal(textoOferta("frete_gratis", 0), "frete grátis");
});
