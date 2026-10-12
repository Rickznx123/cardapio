"use client";

import { useSyncExternalStore } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

type Toast = { id: number; texto: string; tipo: "ok" | "erro" };

let toasts: Toast[] = [];
let seq = 0;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

function mostrar(texto: string, tipo: Toast["tipo"]) {
  const id = ++seq;
  toasts = [...toasts, { id, texto, tipo }];
  avisar();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    avisar();
  }, tipo === "erro" ? 5000 : 3000);
}

export const toast = {
  ok: (texto: string) => mostrar(texto, "ok"),
  erro: (texto: string) => mostrar(texto, "erro"),
};

const assinar = (f: () => void) => (ouvintes.add(f), () => ouvintes.delete(f));
const vazio: Toast[] = [];

// Montar uma vez por área. aria-live anuncia a mensagem para leitores de tela.
export function Toaster() {
  const lista = useSyncExternalStore(assinar, () => toasts, () => vazio);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {lista.map((t) => (
        <div key={t.id} role={t.tipo === "erro" ? "alert" : "status"}
          className={`animate-surgir pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.tipo === "erro" ? "bg-red-600" : "bg-emerald-600"}`}>
          {t.tipo === "erro" ? <CircleAlert className="size-5 shrink-0" /> : <CircleCheck className="size-5 shrink-0" />}
          {t.texto}
        </div>
      ))}
    </div>
  );
}
