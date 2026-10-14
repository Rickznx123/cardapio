import assert from "node:assert/strict";
import { test } from "node:test";
import { comandasPedidoAceito, type PedidoBalcao } from "./cupom.ts";

const pedido: PedidoBalcao = {
  id: "pedido-teste",
  numero: 42,
  tipo: "entrega",
  status: "preparo",
  aceite_pendente: false,
  cliente_nome: "Cliente Teste",
  cliente_telefone: "66999990000",
  endereco: "Rua das Flores, 100",
  bairro_nome: "Centro",
  taxa_entrega: 5,
  subtotal: 30,
  total: 32,
  observacao: "Sem talher",
  impresso_em: null,
  aceito_em: "2026-10-13T12:00:00.000Z",
  created_at: "2026-10-13T12:00:00.000Z",
  comanda_id: null,
  cancelamento_motivo: null,
  forma_pagamento: "dinheiro",
  troco_para: 50,
  pago: false,
  pago_em: null,
  desconto: 3,
  cupom_id: "cupom-teste",
  cupons: { codigo: "VOLTEI" },
  origem: "web",
  pedido_itens: [
    { nome: "X-Burger", preco: 30, quantidade: 1, observacao: "sem cebola", ponto_carne: null },
  ],
  comandas: null,
  membros: null,
};

test("aceitar pedido gera exatamente uma comanda da cozinha e uma do caixa", () => {
  const comandas = comandasPedidoAceito("Restaurante", pedido);
  assert.equal(comandas.length, 2);
  assert.match(comandas[0], /COZINHA/);
  assert.match(comandas[1], /PEDIDO #42/);
});

test("comanda da cozinha omite valores e a do caixa inclui totais, desconto e dados de entrega", () => {
  const [cozinha, caixa] = comandasPedidoAceito("Restaurante", pedido);
  assert.match(cozinha, /X-Burger/);
  assert.match(cozinha, /sem cebola/);
  assert.doesNotMatch(cozinha, /R\$/);
  assert.match(caixa, /R\$/);
  assert.match(caixa, /VOLTEI/);
  assert.match(caixa, /Taxa entrega/);
  assert.match(caixa, /TOTAL/);
  assert.match(caixa, /-\s?R\$/);
  assert.match(caixa, /Rua das Flores, 100/);
  assert.match(caixa, /Cliente Teste/);
  assert.match(caixa, /Dinheiro/);
});
