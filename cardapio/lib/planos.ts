// Plano único e situação do teste grátis. Sem imports com "@/": roda no `node --test`.

export const PRECO_MENSAL = 149.9;
// Sem taxa de setup: a implantação vem no plano.
export const CONFIGURACAO_INCLUSA =
  "Configuração completa inclusa: cadastramos seu cardápio, fotos, QR Codes e instalamos a impressora";
export const DIAS_TRIAL = 3; // o banco é quem grava (default de empresas.trial_ate)
export const INCLUI = [
  "Pedidos ilimitados, sem taxa por pedido",
  "Cardápio digital com fotos, busca e link próprio",
  "Delivery com taxa por bairro e retirada no balcão",
  "App do garçom para pedidos na mesa",
  "Impressão automática de cupons",
  "Caixa, histórico e relatórios de vendas",
  "Chatbot e avisos de pedido no WhatsApp",
  "Suporte direto pelo WhatsApp",
];

export type PlanoStatus = "trial" | "ativo" | "vencido" | "cancelado";

// Espelha empresa_liberada() do banco (que é quem barra pedidos); aqui é só para a tela.
export function situacaoPlano(
  e: { ativo: boolean; plano_status: PlanoStatus; trial_ate: string | null; cortesia?: boolean; pago_ate?: string | null },
  agora: number,
) {
  const restaMs = e.trial_ate ? Date.parse(e.trial_ate) - agora : 0;
  const trial = e.plano_status === "trial";
  const pagoAteMs = e.pago_ate ? Date.parse(e.pago_ate) : Number.NaN;
  const emCarencia = Number.isFinite(pagoAteMs) && pagoAteMs + 3 * 86_400_000 > agora;
  return {
    trial,
    liberada: e.ativo && (Boolean(e.cortesia) || e.plano_status === "ativo" || (trial && restaMs > 0) || emCarencia),
    // Arredonda para cima: com 2h restantes ainda é "1 dia".
    diasRestantes: trial ? Math.max(0, Math.ceil(restaMs / 86_400_000)) : null,
    emCarencia,
  };
}
