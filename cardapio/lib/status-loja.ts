import { FUSO } from "./horarios.ts";

export type StatusLoja = {
  aberto: boolean;
  horarios_configurados: boolean;
  proxima_mudanca: string | null;
};

export function lerStatusLoja(valor: unknown): StatusLoja {
  if (
    typeof valor !== "object" || valor === null
    || !("aberto" in valor) || typeof valor.aberto !== "boolean"
    || !("horarios_configurados" in valor) || typeof valor.horarios_configurados !== "boolean"
    || !("proxima_mudanca" in valor)
    || (valor.proxima_mudanca !== null && typeof valor.proxima_mudanca !== "string")
  ) {
    throw new Error("O banco retornou um status de funcionamento inválido.");
  }
  return {
    aberto: valor.aberto,
    horarios_configurados: valor.horarios_configurados,
    proxima_mudanca: valor.proxima_mudanca,
  };
}

export function textoProximaMudanca(status: StatusLoja, agora = new Date()) {
  if (!status.proxima_mudanca) return status.aberto ? "" : "Sem próximo horário de abertura";
  const instante = new Date(status.proxima_mudanca);
  if (Number.isNaN(instante.getTime())) throw new Error("O banco retornou um horário de funcionamento inválido.");

  const partes = (data: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(data).map((parte) => [parte.type, parte.value]));
  const proxima = partes(instante);
  const hoje = partes(agora);
  const dias = Math.round((Date.parse(`${proxima.year}-${proxima.month}-${proxima.day}T00:00:00Z`)
    - Date.parse(`${hoje.year}-${hoje.month}-${hoje.day}T00:00:00Z`)) / 86_400_000);
  const nomeDia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long" }).format(instante);
  const dia = dias === 1 ? "amanhã" : dias > 1 ? `na ${nomeDia}` : "";
  const acao = status.aberto ? "Fecha" : "Abre";
  return `${acao}${dia ? ` ${dia}` : ""} às ${proxima.hour}:${proxima.minute}`;
}
