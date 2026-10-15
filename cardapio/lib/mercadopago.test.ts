// node --test lib/mercadopago.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { statusPagamento, verificarAssinaturaMercadoPago as ok } from "./mercadopago.ts";

// HMACs de referência calculados com openssl (fora deste código).
const SECRET = "segredo-de-teste";
const TS = "1742505638683";
const REQ = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";
const V1 = "5023cbe9cab59a771f066474fc4889f3def17cc04e05e8c531946c6b4d61cbe2"; // id:123456;request-id:REQ;ts:TS;
const V1_SEM_REQ = "ebcf205883ee8ed08804b8d5076165e94d648f81855f01ca72013e0022fa139e"; // id:abc123def;ts:TS;

test("assinatura válida no padrão do Mercado Pago", () => {
  assert.equal(ok({ xSignature: `ts=${TS},v1=${V1}`, xRequestId: REQ, dataId: "123456" }, SECRET), true);
  assert.equal(ok({ xSignature: ` v1=${V1} , ts=${TS} `, xRequestId: REQ, dataId: "123456" }, SECRET), true);
});

test("sem x-request-id sai do manifest; data.id alfanumérico em minúsculas", () => {
  assert.equal(ok({ xSignature: `ts=${TS},v1=${V1_SEM_REQ}`, xRequestId: null, dataId: "ABC123DEF" }, SECRET), true);
});

test("rejeita assinatura adulterada, outro id, outro ts, outro segredo e cabeçalho ruim", () => {
  const base = { xSignature: `ts=${TS},v1=${V1}`, xRequestId: REQ, dataId: "123456" };
  assert.equal(ok({ ...base, xSignature: `ts=${TS},v1=${V1.replace(/^5/, "6")}` }, SECRET), false);
  assert.equal(ok({ ...base, dataId: "123457" }, SECRET), false);
  assert.equal(ok({ ...base, xSignature: `ts=1,v1=${V1}` }, SECRET), false);
  assert.equal(ok(base, "outro"), false);
  assert.equal(ok(base, ""), false);
  assert.equal(ok({ ...base, xSignature: null }, SECRET), false);
  assert.equal(ok({ ...base, xSignature: `ts=${TS}` }, SECRET), false);
  assert.equal(ok({ ...base, xSignature: `ts=${TS},v1=zz` }, SECRET), false);
  assert.equal(ok({ ...base, xSignature: `ts=${TS},v1=${V1.slice(0, 10)}` }, SECRET), false);
});

test("status do Mercado Pago → status do pagamento", () => {
  assert.equal(statusPagamento("approved"), "aprovado");
  assert.equal(statusPagamento("rejected"), "recusado");
  assert.equal(statusPagamento("cancelled"), "cancelado");
  assert.equal(statusPagamento("refunded"), "estornado");
  assert.equal(statusPagamento("charged_back"), "estornado");
  assert.equal(statusPagamento("in_process"), "pendente");
  assert.equal(statusPagamento(undefined), "pendente");
});
