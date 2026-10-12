"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const supabase = createClient();

export const input = "w-full rounded border p-2";
export const botao = "rounded bg-rose-600 px-4 py-2 font-semibold text-white disabled:opacity-50";
export const botaoSec = "rounded border px-3 py-2 text-sm";

export { brl } from "@/lib/tipos";
// Aceita "12,50" ou "12.50".
export const valor = (s: FormDataEntryValue | string | null) => Number(String(s ?? "").replace(",", ".")) || 0;

export async function ok(p: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await p;
  if (error) alert(error.message);
  return !error;
}

export function useLista<T>(tabela: string, empresaId: string, ordem: string) {
  const [linhas, setLinhas] = useState<T[]>([]);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    supabase.from(tabela).select("*").eq("empresa_id", empresaId).order(ordem)
      .then(({ data, error }) => (error ? alert(error.message) : setLinhas(data as T[])));
  }, [tabela, empresaId, ordem, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return [linhas, recarregar] as const;
}

export const atualizar = (tabela: string, id: string, campos: object) =>
  ok(supabase.from(tabela).update(campos).eq("id", id));

export async function remover(tabela: string, id: string, depois: () => void) {
  if (confirm("Excluir?") && (await ok(supabase.from(tabela).delete().eq("id", id)))) depois();
}

// Campo editável inline: salva no blur, só se mudou.
export function Campo({ valor, salvar, className = input, ...props }:
  { valor: string | number; salvar: (v: string) => void } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input defaultValue={valor} className={className} {...props}
      onBlur={(e) => e.target.value !== String(valor) && salvar(e.target.value)} />
  );
}

export function Ativo({ marcado, salvar, rotulo = "Ativo" }:
  { marcado: boolean; salvar: (v: boolean) => void; rotulo?: string }) {
  return (
    <label className="flex shrink-0 items-center gap-1 text-sm">
      <input type="checkbox" defaultChecked={marcado} onChange={(e) => salvar(e.target.checked)} />
      {rotulo}
    </label>
  );
}
