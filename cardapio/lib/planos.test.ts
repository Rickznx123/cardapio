// node --test lib/planos.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { DIAS_TRIAL, situacaoPlano } from "./planos.ts";
import { erroSlug, gerarSlug } from "./slug.ts";

const agora = Date.parse("2026-10-13T12:00:00Z");
const dia = 86_400_000;
const em = (ms: number) => new Date(agora + ms).toISOString();

test("trial no prazo: liberada, dias arredondados para cima", () => {
  assert.equal(DIAS_TRIAL, 3);
  assert.deepEqual(situacaoPlano({ ativo: true, plano_status: "trial", trial_ate: em(DIAS_TRIAL * dia) }, agora),
    { trial: true, liberada: true, diasRestantes: DIAS_TRIAL });
  assert.equal(situacaoPlano({ ativo: true, plano_status: "trial", trial_ate: em(2 * 3600_000) }, agora).diasRestantes, 1);
});

test("trial vencido, plano ativo, desativada pelo super admin", () => {
  assert.deepEqual(situacaoPlano({ ativo: true, plano_status: "trial", trial_ate: em(-1) }, agora),
    { trial: true, liberada: false, diasRestantes: 0 });
  assert.equal(situacaoPlano({ ativo: true, plano_status: "trial", trial_ate: null }, agora).liberada, false);
  assert.equal(situacaoPlano({ ativo: true, plano_status: "ativo", trial_ate: em(-30 * dia) }, agora).liberada, true);
  assert.equal(situacaoPlano({ ativo: false, plano_status: "ativo", trial_ate: null }, agora).liberada, false);
  assert.equal(situacaoPlano({ ativo: true, plano_status: "cancelado", trial_ate: em(dia) }, agora).liberada, false);
});

test("slug a partir do nome", () => {
  assert.equal(gerarSlug("Lanchonete do Zé & Cia"), "lanchonete-do-ze-cia");
  assert.equal(gerarSlug("  Pastelaria São João!! "), "pastelaria-sao-joao");
  assert.equal(gerarSlug("A".repeat(39) + " b"), "a".repeat(39));
  assert.equal(erroSlug(gerarSlug("Açaí 10")), null);
  assert.notEqual(erroSlug("cadastro"), null);
});
