"use client";

import { useSyncExternalStore } from "react";
import { Check, CircleAlert, CircleCheck } from "lucide-react";

type Toast = { id: number; texto: string; tipo: "ok" | "erro" | "salvo" };

let toasts: Toast[] = [];
let seq = 0;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const DURACAO = { ok: 3000, erro: 5000, salvo: 1400 };

function mostrar(texto: string, tipo: Toast["tipo"]) {
  const id = ++seq;
  // "Salvo" é discreto: no máximo um na tela, o mais recente substitui o anterior.
  toasts = [...(tipo === "salvo" ? toasts.filter((t) => t.tipo !== "salvo") : toasts), { id, texto, tipo }];
  avisar();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    avisar();
  }, DURACAO[tipo]);
}

export const toast = {
  ok: (texto: string) => mostrar(texto, "ok"),
  erro: (texto: string) => mostrar(texto, "erro"),
  salvo: (texto = "Salvo") => mostrar(texto, "salvo"),
};

const assinar = (f: () => void) => (ouvintes.add(f), () => ouvintes.delete(f));
const vazio: Toast[] = [];

// Montar uma vez por área. aria-live anuncia a mensagem para leitores de tela.
export function Toaster() {
  const lista = useSyncExternalStore(assinar, () => toasts, () => vazio);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {lista.map((t) =>
        t.tipo === "salvo" ? (
          <div key={t.id} role="status"
            className="animate-surgir flex items-center gap-1.5 rounded-full bg-neutral-900/85 px-3 py-1.5 text-xs font-medium text-white shadow dark:bg-white/90 dark:text-neutral-900">
            <Check className="size-3.5" /> {t.texto}
          </div>
        ) : (
          <div key={t.id} role={t.tipo === "erro" ? "alert" : "status"}
            className={`animate-surgir pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
              t.tipo === "erro" ? "bg-red-600" : "bg-emerald-600"}`}>
            {t.tipo === "erro" ? <CircleAlert className="size-5 shrink-0" /> : <CircleCheck className="size-5 shrink-0" />}
            {t.texto}
          </div>
        ),
      )}
    </div>
  );
}
