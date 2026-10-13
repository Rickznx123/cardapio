import type { ErrorEvent } from "@sentry/nextjs";

// Dados pessoais que podem aparecer em mensagens de erro (ex.: erro do banco ecoando o que o cliente digitou).
// Ordem importa: e-mail e CPF antes do telefone (CPF tem 11 dígitos, como um celular).
const PADROES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]"],
  [/(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g, "[cpf]"],
  [/(?<![\d-])\d{11}(?![\d-])/g, "[cpf-ou-telefone]"], // 11 dígitos seguidos: CPF ou celular sem máscara
  [/(?<![\w-])(\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}(?![\w-])/g, "[telefone]"],
  [/(?<!\d)\d{5}-\d{3}(?!\d)/g, "[cep]"],
  [/\b(rua|r\.|avenida|av\.|travessa|tv\.|alameda|al\.|rodovia|estrada|pra[cç]a|p[cç]a\.)\s+[^,;\n"]{1,80}(,\s*(n[º°o.]*\s*)?\d+\w?)?/gi, "[endereço]"],
];

export const limparTexto = (s: string) => PADROES.reduce((t, [re, troca]) => t.replace(re, troca), s);

// Aplica em strings dentro de objetos/arrays (extras, dados de breadcrumbs). Profundidade limitada.
function limpar(v: unknown, nivel = 0): unknown {
  if (typeof v === "string") return limparTexto(v);
  if (nivel > 6 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => limpar(x, nivel + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpar(x, nivel + 1)]));
}

export function beforeSend(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = limparTexto(event.message);
  event.exception?.values?.forEach((e) => { if (e.value) e.value = limparTexto(e.value); });
  if (event.extra) event.extra = limpar(event.extra) as ErrorEvent["extra"];
  event.breadcrumbs?.forEach((b) => {
    if (b.message) b.message = limparTexto(b.message);
    if (b.data) b.data = limpar(b.data) as typeof b.data;
  });
  if (event.request) {
    delete event.request.data; // corpo da requisição (cadastro, pedido, PIN do garçom...)
    delete event.request.cookies;
    if (event.request.query_string) event.request.query_string = "[removido]";
  }
  return event;
}

// Opções do Sentry iguais em client, server e edge. Sem NEXT_PUBLIC_SENTRY_DSN (dev) o Sentry fica desligado.
export const opcoesSentry = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false, // sem IP, cookies nem dados do usuário
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  beforeSend,
};
