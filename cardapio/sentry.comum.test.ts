// node --test sentry.comum.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { beforeSend, limparTexto } from "./sentry.comum.ts";

test("remove e-mail, CPF, telefone, CEP e endereço", () => {
  assert.equal(limparTexto("Key (email)=(maria.silva+x@gmail.com) already exists"), "Key (email)=([email]) already exists");
  assert.equal(limparTexto("cpf 072.426.721-20"), "cpf [cpf]");
  assert.equal(limparTexto("tel (66) 99999-1234 ok"), "tel [telefone] ok");
  assert.equal(limparTexto("tel 66 3521-1234"), "tel [telefone]");
  assert.equal(limparTexto("whats +55 66 99999-1234"), "whats [telefone]");
  assert.equal(limparTexto("number 5566999991234"), "number [telefone]");
  assert.equal(limparTexto("doc 07242672120"), "doc [cpf-ou-telefone]");
  assert.equal(limparTexto("CEP 78580-000"), "CEP [cep]");
  assert.equal(limparTexto("Entregar na Rua das Flores, 123, Centro"), "Entregar na [endereço], Centro");
  assert.equal(limparTexto("Av. Brasil nº 45"), "[endereço]");
});

test("não estraga o que não é dado pessoal", () => {
  const id = "pedido 3f2b9c1e-8a4d-4f6b-9c2e-1a2b3c4d5e6f status 42";
  assert.equal(limparTexto(id), id);
  assert.equal(limparTexto("Evolution 502 em 2026-10-13T12:00:00Z"), "Evolution 502 em 2026-10-13T12:00:00Z");
  assert.equal(limparTexto("Pedido mínimo para este bairro: R$ 30.00"), "Pedido mínimo para este bairro: R$ 30.00");
});

test("beforeSend limpa mensagem, exceção, extras e tira o corpo da requisição", () => {
  const e = beforeSend({
    type: undefined,
    message: "falhou para joao@x.com",
    exception: { values: [{ type: "Error", value: "telefone (66) 98888-7777 inválido" }] },
    extra: { pedido: { endereco: "Rua A, 10", obs: ["ligar 66988887777"] } },
    request: { url: "https://x/api/cadastro", data: { senha: "123" }, query_string: "slug=a", cookies: { a: "b" } },
  });
  assert.equal(e.message, "falhou para [email]");
  assert.equal(e.exception?.values?.[0].value, "telefone [telefone] inválido");
  assert.deepEqual(e.extra, { pedido: { endereco: "[endereço]", obs: ["ligar [cpf-ou-telefone]"] } });
  assert.equal(e.request?.data, undefined);
  assert.equal(e.request?.cookies, undefined);
  assert.equal(e.request?.query_string, "[removido]");
  assert.equal(e.request?.url, "https://x/api/cadastro");
});
