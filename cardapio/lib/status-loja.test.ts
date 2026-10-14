import assert from "node:assert/strict";
import { test } from "node:test";
import { lerStatusLoja, textoProximaMudanca } from "./status-loja.ts";

test("valida o formato retornado pelo RPC de status", () => {
  assert.deepEqual(lerStatusLoja({
    aberto: true, horarios_configurados: true, proxima_mudanca: "2026-10-15T03:00:00Z",
  }), {
    aberto: true, horarios_configurados: true, proxima_mudanca: "2026-10-15T03:00:00Z",
  });
  assert.throws(() => lerStatusLoja({ aberto: "sim" }));
});

test("mostra próximo fechamento e abertura no fuso de Cuiabá", () => {
  const agora = new Date("2026-10-14T20:00:00Z"); // quarta, 16:00 em Cuiabá
  assert.equal(textoProximaMudanca({
    aberto: true, horarios_configurados: true, proxima_mudanca: "2026-10-15T03:00:00Z",
  }, agora), "Fecha às 23:00");
  assert.equal(textoProximaMudanca({
    aberto: false, horarios_configurados: true, proxima_mudanca: "2026-10-15T22:00:00Z",
  }, agora), "Abre amanhã às 18:00");
});
