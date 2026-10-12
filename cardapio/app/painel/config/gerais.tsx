"use client";

import { useState } from "react";
import { DIAS, type Horarios } from "@/lib/tipos";
import type { Empresa } from "../configuracoes";
import { botao, card, input, ok, rotulo, supabase } from "../ui";

const opcao = "flex cursor-pointer items-center justify-between gap-3 py-3";
const check = "size-5 accent-rose-600";
const PADRAO = { aberto: true, abre: "18:00", fecha: "23:00" };
const minutos = (v: FormDataEntryValue | null) => (String(v ?? "").trim() === "" ? null : Math.max(0, Math.round(Number(v))));

// Configurações ▸ Gerais: modos de atendimento, tempos estimados e horário por dia da semana.
export function Gerais({ empresa, mudou }: { empresa: Empresa; mudou: (e: Empresa) => void }) {
  const [horarios, setHorarios] = useState<Horarios>(empresa.horarios ?? {});
  const [salvando, setSalvando] = useState(false);

  function mudarDia(d: keyof Horarios, campos: Partial<typeof PADRAO>) {
    setHorarios((h) => ({ ...h, [d]: { ...PADRAO, ...h[d], ...campos } }));
  }

  async function salvar(f: FormData) {
    const campos = {
      aceita_entrega: f.get("aceita_entrega") === "on",
      aceita_retirada: f.get("aceita_retirada") === "on",
      tempo_entrega_min: minutos(f.get("tempo_entrega_min")),
      tempo_entrega_max: minutos(f.get("tempo_entrega_max")),
      tempo_retirada: minutos(f.get("tempo_retirada")),
      horarios,
    };
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
            const h = horarios[d] ?? { ...PADRAO, aberto: false };
            return (
              <li key={d} className="flex flex-wrap items-center gap-3 py-2">
                <label className="flex w-36 cursor-pointer items-center gap-2 font-medium">
                  <input type="checkbox" checked={h.aberto} onChange={(e) => mudarDia(d, { aberto: e.target.checked })} className={check} />
                  {nome}
                </label>
                {h.aberto ? (
                  <span className="flex items-center gap-2 text-sm">
                    <input type="time" value={h.abre} onChange={(e) => mudarDia(d, { abre: e.target.value })} aria-label={`${nome}: abre às`}
                      className={`${input} w-32`} />
                    às
                    <input type="time" value={h.fecha} onChange={(e) => mudarDia(d, { fecha: e.target.value })} aria-label={`${nome}: fecha às`}
                      className={`${input} w-32`} />
                  </span>
                ) : <span className="text-sm text-neutral-500">Fechado</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <button disabled={salvando} className={`${botao} w-full sm:w-auto`}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
    </form>
  );
}
