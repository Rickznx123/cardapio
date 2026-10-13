"use client";

import { useCallback, useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/client";
import type { Empresa } from "./configuracoes";

export const supabase = createClient();

export const input =
  "h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-neutral-950";
export const inputNum = input.replace("w-full", "w-24");
export const botao =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 font-semibold text-white hover:bg-rose-700 disabled:opacity-50";
export const botaoSec =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";
export const botaoIcone =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950";
export const card = "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
export const rotulo = "mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300";

export { brl } from "@/lib/tipos";
// Aceita "12,50" ou "12.50".
export const valor = (s: FormDataEntryValue | string | null) => Number(String(s ?? "").replace(",", ".")) || 0;

export async function ok(p: PromiseLike<{ error: { message: string } | null }>, sucesso?: string) {
  const { error } = await p;
  if (error) toast.erro(error.message);
  else if (sucesso) toast.ok(sucesso);
  return !error;
}

export function useLista<T>(tabela: string, empresaId: string, ordem: string) {
  const [linhas, setLinhas] = useState<T[]>([]);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    supabase.from(tabela).select("*").eq("empresa_id", empresaId).order(ordem)
      .then(({ data, error }) => (error ? toast.erro(error.message) : setLinhas(data as T[])));
  }, [tabela, empresaId, ordem, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return [linhas, recarregar] as const;
}

export const atualizar = (tabela: string, id: string, campos: object) =>
  ok(supabase.from(tabela).update(campos).eq("id", id), "Salvo");

export async function remover(tabela: string, id: string, depois: () => void) {
  if (confirm("Excluir?") && (await ok(supabase.from(tabela).delete().eq("id", id), "Excluído"))) depois();
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
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" defaultChecked={marcado} onChange={(e) => salvar(e.target.checked)}
        aria-label={rotulo || "Ativo"} className="size-5 accent-rose-600" />
      {rotulo}
    </label>
  );
}

// Seletor de foto com preview da imagem escolhida (a compressão acontece ao salvar).
export function FotoInput({ name, atual, titulo }: { name: string; atual: string | null; titulo: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const src = preview ?? atual;
  return (
    <label className="flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-neutral-300 p-3 hover:border-rose-400 dark:border-neutral-700">
      {src ? (
        <img src={src} alt="" className="size-20 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
          <ImagePlus className="size-8" />
        </span>
      )}
      <span>
        <span className="block font-medium">{titulo}</span>
        <span className="block text-sm text-neutral-500 dark:text-neutral-400">
          {preview ? "Nova foto escolhida. Ela é comprimida ao salvar." : src ? "Toque para trocar" : "Toque para escolher"}
        </span>
      </span>
      <input type="file" name={name} accept="image/*" className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setPreview(f ? URL.createObjectURL(f) : null);
        }} />
    </label>
  );
}

export type Papel = "dono" | "caixa";

// Empresa e papel do usuário logado no painel. null = sem login (manda para /login).
export async function carregarSessao(): Promise<{ papel: Papel; empresa: Empresa | null } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  // shortcut: membro de várias empresas vê só a primeira; adicionar seletor quando houver esse caso.
  const { data } = await supabase
    .from("membros")
    .select("papel, empresas(*)")
    .eq("user_id", user.id)
    .in("papel", ["dono", "caixa"])
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  return { papel: (data?.papel ?? "caixa") as Papel, empresa: (data?.empresas as unknown as Empresa) ?? null };
}
