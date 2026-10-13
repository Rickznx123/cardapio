import assert from "node:assert/strict";
import test from "node:test";
import { adicionarCom, paraRpc, type LinhaCarrinho } from "./linhas.ts";

const linha = (id: string, ponto_carne: string | null): LinhaCarrinho => ({
  id, item_id: "burger", quantidade: 1, observacao: "", ponto_carne,
});

test("itens iguais com pontos diferentes permanecem em linhas separadas", () => {
  const linhas = [linha("a", "Mal passado")];
  const resultado = adicionarCom(linhas, "burger", 1, "", "Bem passado");

  assert.equal(resultado.length, 2);
  assert.deepEqual(resultado.map((l) => l.ponto_carne), ["Mal passado", "Bem passado"]);
});

test("mesma escolha e observação soma na linha existente", () => {
  const linhas = [linha("a", "Ao ponto")];
  const resultado = adicionarCom(linhas, "burger", 2, "", "Ao ponto");

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].quantidade, 3);
});

test("RPC recebe o ponto escolhido e mantém linhas antigas sem escolha compatíveis", () => {
  const linhas = [linha("a", "Ao ponto"), { ...linha("b", null), ponto_carne: undefined }];

  assert.deepEqual(paraRpc(linhas).map((l) => l.ponto_carne), ["Ao ponto", null]);
});
