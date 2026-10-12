"use client";

import { useCallback, useSyncExternalStore } from "react";

// Estado JSON no localStorage, compartilhado entre componentes e abas.
// Se o storage estiver bloqueado (aba anônima etc.), cai para memória.
const memoria = new Map<string, string>();
const ouvintes = new Set<() => void>();

function ler(chave: string) {
  try {
    return localStorage.getItem(chave) ?? memoria.get(chave) ?? null;
  } catch {
    return memoria.get(chave) ?? null;
  }
}

export function gravar(chave: string, valor: unknown) {
  const s = JSON.stringify(valor);
  memoria.set(chave, s);
  try {
    localStorage.setItem(chave, s);
  } catch {}
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void) {
  ouvintes.add(f);
  window.addEventListener("storage", f);
  return () => {
    ouvintes.delete(f);
    window.removeEventListener("storage", f);
  };
}

export function useArmazenado<T>(chave: string, inicial: T) {
  const bruto = useSyncExternalStore(assinar, () => ler(chave), () => null);
  // JSON.parse a cada render é barato para um carrinho; o snapshot (string) é estável.
  let valor = inicial;
  try {
    if (bruto) valor = JSON.parse(bruto);
  } catch {}
  const set = useCallback((v: T) => gravar(chave, v), [chave]);
  return [valor, set] as const;
}
