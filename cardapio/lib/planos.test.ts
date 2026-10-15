// node --test lib/planos.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { avisoDoDia, DIAS_TRIAL, situacaoPlano } from "./planos.ts";
import { erroSlug, gerarSlug } from "./slug.ts";

const agora = Date.parse("2026-10-13T12:00:00Z");
const dia = 86_400_000;
const em = (ms: number) => new Date(agora + ms).toISOString();

test("trial no prazo: liberada, dias arredondados para cima", () => {
  assert.equal(DIAS_TRIAL, 3);
  assert.deepEqual(situacaoPlano({ ativo: true, plano_status: "trial", trial_ate: em(DIAS_TRIAL * dia) }, agora),
    { trial: true, liberada: true, diasRestantes: DIAS_TRIAL, emCarencia: false });
  assert.equal(situacaoPlano({ ativo: true, plano_status: "trial", trial_ate: em(2 * 3600_000) }, agora).diasRestantes, 1);
});

test("trial vencido, plano ativo, desativada pelo super admin", () => {
  assert.deepEqual(situacaoPlano({ ativo: true, plano_status: "trial", trial_ate: em(-1) }, agora),
    { trial: true, liberada: false, diasRestantes: 0, emCarencia: false });
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

test("lembretes da rotina: 3 dias antes e no dia, em dias de Cuiabá", () => {
  // agora = 13/10 08:00 em Cuiabá
  const pix = (pago_ate: string) => avisoDoDia({ plano_status: "ativo", forma_assinatura: "pix", pago_ate, trial_ate: null, cortesia: false }, agora);
  assert.deepEqual(pix("2026-10-16T15:00:00Z"), { tipo: "pix_3d", chave: "pix_3d:2026-10-16", vence: "2026-10-16T15:00:00Z" });
  assert.equal(pix("2026-10-14T03:30:00Z")?.chave, "pix_hoje:2026-10-13"); // 23:30 do dia 13 em Cuiabá, já 14 em UTC
  assert.equal(pix("2026-10-15T12:00:00Z"), null);
  assert.equal(pix("2026-10-12T12:00:00Z"), null);
  const trial = avisoDoDia({ plano_status: "trial", forma_assinatura: null, pago_ate: null, trial_ate: "2026-10-13T20:00:00Z", cortesia: false }, agora);
  assert.equal(trial?.tipo, "trial_hoje");
  assert.equal(avisoDoDia({ plano_status: "trial", forma_assinatura: null, pago_ate: null, trial_ate: "2026-10-16T20:00:00Z", cortesia: true }, agora), null);
  assert.equal(avisoDoDia({ plano_status: "ativo", forma_assinatura: "cartao", pago_ate: "2026-10-16T15:00:00Z", trial_ate: null, cortesia: false }, agora), null);
  assert.equal(avisoDoDia({ plano_status: "vencido", forma_assinatura: "pix", pago_ate: "2026-10-13T15:00:00Z", trial_ate: null, cortesia: false }, agora), null);
});

test("carência de 3 dias depois de pago_ate", () => {
  const base = { ativo: true, plano_status: "cancelado" as const, trial_ate: null };
  assert.equal(situacaoPlano({ ...base, pago_ate: em(-2 * dia) }, agora).liberada, true);
  assert.equal(situacaoPlano({ ...base, pago_ate: em(-4 * dia) }, agora).liberada, false);
  assert.equal(situacaoPlano({ ...base, pago_ate: null, cortesia: true }, agora).liberada, true);
});
