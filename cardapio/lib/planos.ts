// Plano único e situação do teste grátis. Sem imports com "@/": roda no `node --test`.
import { FUSO } from "./horarios.ts";

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

// Assinatura no cartão em vigor: não oferece outro cartão nem Pix por cima.
export const cartaoAtivo = (e: { mp_preapproval_id: string | null; forma_assinatura: string | null; plano_status: PlanoStatus }) =>
  !!e.mp_preapproval_id && e.forma_assinatura === "cartao" && e.plano_status === "ativo";

export type AvisoRotina = "pix_3d" | "pix_hoje" | "trial_3d" | "trial_hoje";
const diaLocal = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(ms); // AAAA-MM-DD

// Lembrete do dia (rotina das 09:00): Pix ou teste que vence em 3 dias ou hoje, contando dias de Cuiabá.
// A chave leva a data de vencimento: um aviso por período, mesmo que a rotina rode mais de uma vez.
export function avisoDoDia(
  e: { plano_status: PlanoStatus; forma_assinatura: string | null; pago_ate: string | null; trial_ate: string | null; cortesia: boolean },
  agora: number,
): { tipo: AvisoRotina; chave: string; vence: string } | null {
  if (e.cortesia) return null;
  const [base, vence] = e.plano_status === "trial" ? ["trial", e.trial_ate]
    : e.plano_status === "ativo" && e.forma_assinatura === "pix" ? ["pix", e.pago_ate] : [null, null];
  if (!base || !vence) return null;
  const dia = diaLocal(Date.parse(vence));
  const faltam = (Date.parse(dia) - Date.parse(diaLocal(agora))) / 86_400_000;
  const quando = faltam === 3 ? "3d" : faltam === 0 ? "hoje" : null;
  if (!quando) return null;
  const tipo = `${base}_${quando}` as AvisoRotina;
  return { tipo, chave: `${tipo}:${dia}`, vence };
}
