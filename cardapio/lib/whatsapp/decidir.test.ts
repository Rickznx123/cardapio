// node --test lib/whatsapp/decidir.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decidir } from "./decidir.ts";

const base = { pausado: false, aberto: true, saudouRecente: true, texto: "", iaAtiva: false };

test("pausado pelo atendente: não responde", () => {
  assert.equal(decidir({ ...base, pausado: true, saudouRecente: false, texto: "oi" }), null);
});

test("loja fechada: ausência uma vez por intervalo", () => {
  assert.deepEqual(decidir({ ...base, aberto: false, saudouRecente: false }), { tipo: "ausencia", saudacao: true });
  assert.equal(decidir({ ...base, aberto: false, texto: "1" }), null);
});

test("sem saudação no intervalo: boas-vindas", () => {
  assert.deepEqual(decidir({ ...base, saudouRecente: false, texto: "2" }), { tipo: "boas_vindas", saudacao: true });
});

test("opções do menu", () => {
  assert.deepEqual(decidir({ ...base, texto: " 1 " }), { tipo: "fazer_pedido", saudacao: false });
  assert.deepEqual(decidir({ ...base, texto: "4️⃣" }), { tipo: "promocoes", saudacao: false });
  assert.deepEqual(decidir({ ...base, texto: "3." }), { tipo: "informacoes", saudacao: false });
  assert.equal(decidir({ ...base, texto: "5" }), null);
});

test("IA só quando ativa e com texto que não é opção", () => {
  assert.equal(decidir({ ...base, texto: "tem coca?", iaAtiva: true }), "ia");
  assert.equal(decidir({ ...base, texto: "tem coca?" }), null);
  assert.equal(decidir({ ...base, texto: "  ", iaAtiva: true }), null);
  assert.equal(decidir({ ...base, texto: "quero 2 pizzas", iaAtiva: true }), "ia");
});

test("áudio sem IA: boas-vindas (menu); com IA segue o texto transcrito", () => {
  assert.deepEqual(decidir({ ...base, audio: true }), { tipo: "boas_vindas", saudacao: true });
  assert.equal(decidir({ ...base, audio: true, pausado: true }), null);
  assert.deepEqual(decidir({ ...base, audio: true, aberto: false, saudouRecente: false }), { tipo: "ausencia", saudacao: true });
  assert.equal(decidir({ ...base, audio: true, iaAtiva: true, texto: "tem coca?" }), "ia");
});
