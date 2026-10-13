"use client";

import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/toast";
import { type Dia, DIAS, erroHorarios, type Horarios, MAX_TURNOS, type Turno, viraDia } from "@/lib/horarios";
import type { Empresa } from "../configuracoes";
import { botao, botaoIcone, botaoSec, card, input, ok, rotulo, supabase } from "../ui";

const opcao = "flex cursor-pointer items-center justify-between gap-3 py-3";
const check = "size-5 accent-rose-600";
const PRIMEIRO: Turno = { abre: "18:00", fecha: "23:00" };
const OUTRO: Turno = { abre: "11:00", fecha: "14:00" };
const minutos = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Math.max(0, Math.round(Number(v))));

// Configurações ▸ Gerais: modos de atendimento, tempos estimados e horário por dia da semana.
export function Gerais({ empresa, mudou }: { empresa: Empresa; mudou: (e: Empresa) => void }) {
  const [horarios, setHorarios] = useState<Horarios>(empresa.horarios ?? {});
  const [salvando, setSalvando] = useState(false);

  const mudarTurnos = (d: Dia, f: (t: Turno[]) => Turno[]) => setHorarios((h) => ({ ...h, [d]: f(h[d] ?? []) }));
  const mudarTurno = (d: Dia, i: number, campos: Partial<Turno>) =>
    mudarTurnos(d, (ts) => ts.map((t, j) => (j === i ? { ...t, ...campos } : t)));

  function copiarParaTodos(d: Dia, nome: string) {
    if (!confirm(`Copiar os horários de ${nome} para todos os dias?`)) return;
    setHorarios(Object.fromEntries(DIAS.map(([x]) => [x, (horarios[d] ?? []).map((t) => ({ ...t }))])));
  }

  async function salvar(f: FormData) {
    const campos = {
      aceita_entrega: f.get("aceita_entrega") === "on",
      aceita_retirada: f.get("aceita_retirada") === "on",
      tempo_entrega_min: minutos(f.get("tempo_entrega_min")),
      tempo_entrega_max: minutos(f.get("tempo_entrega_max")),
      tempo_retirada: minutos(f.get("tempo_retirada")),
      horarios,
      virada_dia: String(f.get("virada_dia") || "05:00"),
    };
    const erro = erroHorarios(horarios);
    if (erro) return toast.erro(erro);
    if (campos.tempo_entrega_min != null && campos.tempo_entrega_max != null && campos.tempo_entrega_max < campos.tempo_entrega_min) {
      return ok(Promise.resolve({ error: { message: "O tempo máximo de entrega precisa ser maior que o mínimo" } }));
    }
    setSalvando(true);
    if (await ok(supabase.from("empresas").update(campos).eq("id", empresa.id), "Configurações salvas")) mudou({ ...empresa, ...campos });
    setSalvando(false);
  }

  const num = `${input} w-24`;
  return (
    <form onSubmit={(e) => { e.preventDefault(); salvar(new FormData(e.currentTarget)); }} className="space-y-4">
      <section className={`${card} divide-y divide-neutral-200 py-1 dark:divide-neutral-800`}>
        <label className={opcao}><span className="font-medium">Faz entrega</span>
          <input name="aceita_entrega" type="checkbox" defaultChecked={empresa.aceita_entrega} className={check} />
        </label>
        <label className={opcao}><span className="font-medium">Aceita retirada no local</span>
          <input name="aceita_retirada" type="checkbox" defaultChecked={empresa.aceita_retirada} className={check} />
        </label>
      </section>

      <section className={`${card} space-y-4`}>
        <h2 className="text-lg font-semibold">Tempo estimado</h2>
        <p className="text-sm text-neutral-500">Aparece no cardápio. Deixe em branco para não mostrar.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label><span className={rotulo}>Entrega: de (min)</span>
            <input name="tempo_entrega_min" type="number" min={0} max={600} defaultValue={empresa.tempo_entrega_min ?? ""} className={num} />
          </label>
          <label><span className={rotulo}>até (min)</span>
            <input name="tempo_entrega_max" type="number" min={0} max={600} defaultValue={empresa.tempo_entrega_max ?? ""} className={num} />
          </label>
          <label><span className={rotulo}>Retirada (min)</span>
            <input name="tempo_retirada" type="number" min={0} max={600} defaultValue={empresa.tempo_retirada ?? ""} className={num} />
          </label>
        </div>
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className="text-lg font-semibold">Horário de funcionamento</h2>
        <p className="text-sm text-neutral-500">
          Informativo: aparece em &quot;Informações&quot; no cardápio. Abrir e fechar a loja para pedidos continua no botão da barra lateral.
        </p>
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {DIAS.map(([d, nome]) => {
            const turnos = horarios[d] ?? [];
            return (
              <li key={d} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
                <span className="w-24 pt-2.5 font-medium">{nome}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  {turnos.length === 0 && <p className="pt-2.5 text-sm text-neutral-500">Fechado</p>}
                  {turnos.map((t, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <input type="time" value={t.abre} onChange={(e) => mudarTurno(d, i, { abre: e.target.value })}
                        aria-label={`${nome}, turno ${i + 1}: abre às`} className={`${input} w-32`} />
                      às
                      <input type="time" value={t.fecha} onChange={(e) => mudarTurno(d, i, { fecha: e.target.value })}
                        aria-label={`${nome}, turno ${i + 1}: fecha às`} className={`${input} w-32`} />
                      {t.abre && t.fecha && viraDia(t) && (
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">(dia seguinte)</span>
                      )}
                      <button type="button" onClick={() => mudarTurnos(d, (ts) => ts.filter((_, j) => j !== i))}
                        aria-label={`Remover turno ${i + 1} de ${nome}`} className={botaoIcone}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    {turnos.length < MAX_TURNOS && (
                      <button type="button" onClick={() => mudarTurnos(d, (ts) => [...ts, ts.length ? OUTRO : PRIMEIRO])} className={botaoSec}>
                        <Plus className="size-4" /> turno
                      </button>
                    )}
                    {turnos.length > 0 && (
                      <button type="button" onClick={() => copiarParaTodos(d, nome)} className={botaoSec}>
                        <Copy className="size-4" /> Copiar para todos os dias
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`${card} space-y-2`}>
        <h2 className="text-lg font-semibold">Dia de trabalho</h2>
        <label className="flex flex-wrap items-center gap-3"><span className="font-medium">O dia de trabalho termina às</span>
          <input name="virada_dia" type="time" required defaultValue={empresa.virada_dia?.slice(0, 5) ?? "05:00"} className={`${input} w-32`} />
        </label>
        <p className="text-sm text-neutral-500">
          Pedidos feitos de madrugada, antes desse horário, contam no dia anterior no &quot;Hoje&quot; dos Pedidos e nos Relatórios.
        </p>
      </section>

      <button disabled={salvando} className={`${botao} w-full sm:w-auto`}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
    </form>
  );
}
