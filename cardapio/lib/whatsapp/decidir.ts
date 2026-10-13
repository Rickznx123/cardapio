import type { TipoMensagem } from "./mensagens";

// Menu numérico da boas-vindas.
export const OPCOES: Record<string, TipoMensagem> = { 1: "fazer_pedido", 2: "horarios", 3: "informacoes", 4: "promocoes" };

export type Decisao = { tipo: TipoMensagem; saudacao: boolean } | "ia" | null;

// O que responder a uma mensagem do cliente. `saudacao`: conta como saudação (zera o intervalo).
export function decidir(c: { pausado: boolean; aberto: boolean; saudouRecente: boolean; texto: string; iaAtiva: boolean }): Decisao {
  if (c.pausado) return null;
  // Loja fechada: só a ausência, no máximo uma vez por intervalo de saudação (não responde cada mensagem).
  if (!c.aberto) return c.saudouRecente ? null : { tipo: "ausencia", saudacao: true };
  if (!c.saudouRecente) return { tipo: "boas_vindas", saudacao: true };
  const texto = c.texto.trim();
  const opcao = OPCOES[texto.length <= 3 ? texto.replace(/\D/g, "") : ""]; // "1", "1." ou "1️⃣"
  if (opcao) return { tipo: opcao, saudacao: false };
  return c.iaAtiva && texto ? "ia" : null;
}
