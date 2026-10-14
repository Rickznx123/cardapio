// Horários de funcionamento (empresas.horarios) e dia operacional. Sem imports com "@/": roda no `node --test`.

export const FUSO = "America/Cuiaba";

export const DIAS = [
  ["dom", "Domingo"], ["seg", "Segunda"], ["ter", "Terça"], ["qua", "Quarta"],
  ["qui", "Quinta"], ["sex", "Sexta"], ["sab", "Sábado"],
] as const;
export type Dia = (typeof DIAS)[number][0];
// "fecha" <= "abre" = o turno termina no dia seguinte (ex.: 18:30 às 02:00). Lista vazia ou ausente = fechado.
export type Turno = { abre: string; fecha: string };
export type Horarios = Partial<Record<Dia, Turno[]>>;
export const MAX_TURNOS = 3;

const DIA_MIN = 1440;
export const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const viraDia = (t: Turno) => minutos(t.fecha) <= minutos(t.abre);
export const textoTurno = (t: Turno) => `${t.abre} às ${t.fecha}`;
export const textoDia = (turnos: Turno[] | undefined) => (turnos?.length ? turnos.map(textoTurno).join(" e ") : "Fechado");
export const temHorarios = (h: Horarios | null | undefined) => !!h && DIAS.some(([d]) => h[d]?.length);

// Turnos sobrepostos na semana (inclui a madrugada invadindo o dia seguinte, e sábado → domingo). null = ok.
export function erroHorarios(h: Horarios) {
  for (const [d, nome] of DIAS) {
    if ((h[d] ?? []).some((t) => !/^\d\d:\d\d/.test(t.abre) || !/^\d\d:\d\d/.test(t.fecha))) return `${nome}: preencha os horários`;
  }
  const semana = DIAS.flatMap(([d, nome], i) => (h[d] ?? []).map((t) => {
    const ini = i * DIA_MIN + minutos(t.abre);
    return { nome, ini, fim: ini + ((minutos(t.fecha) - minutos(t.abre) + DIA_MIN) % DIA_MIN || DIA_MIN) };
  }));
  const SEMANA = 7 * DIA_MIN;
  for (const a of semana) for (const b of semana) {
    if (a === b) continue;
    // b começa dentro de a (testando também b deslocado uma semana, para sábado → domingo).
    if ([b.ini, b.ini + SEMANA].some((ini) => ini >= a.ini && ini < a.fim)) {
      return a.nome === b.nome ? `${a.nome}: turnos se sobrepõem` : `${a.nome} invade o turno de ${b.nome}`;
    }
  }
  return null;
}

// Relógio de parede no fuso da loja.
function parede(data: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(data).map((x) => [x.type, x.value]));
  return {
    dia: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
    data: `${p.year}-${p.month}-${p.day}`,
    min: Number(p.hour) * 60 + Number(p.minute),
  };
}

// ---------- Dia operacional: o dia de trabalho termina às `virada` (ex.: 05:00) do dia seguinte ----------
export const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// "AAAA-MM-DD" do dia de trabalho a que o instante pertence.
export const diaOperacional = (data: Date, virada: string) => parede(new Date(data.getTime() - minutos(virada) * 60_000)).data;

// Instante em que o dia de trabalho `dia` começa (às `virada`, no fuso da loja).
export function inicioDiaOperacional(dia: string, virada: string) {
  const chute = Date.parse(`${dia}T00:00:00Z`) + minutos(virada) * 60_000;
  const p = parede(new Date(chute));
  const desvio = Date.parse(`${p.data}T00:00:00Z`) + p.min * 60_000 - chute; // fuso − UTC
  return new Date(chute - desvio);
}
