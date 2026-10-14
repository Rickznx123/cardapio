"use client";

import { useState } from "react";
import { toast } from "@/components/toast";
import type { ConfigImpressao } from "@/lib/cupom";
import { enviarFoto } from "@/lib/foto";
import type { PlanoStatus } from "@/lib/planos";
import { erroSlug } from "@/lib/slug";
import type { FormaPagamento, Horarios } from "@/lib/tipos";
import { botao, card, FotoInput, input, ok, rotulo, supabase } from "./ui";

export type Empresa = {
  id: string; nome: string; slug: string; logo_url: string | null; cor_primaria: string | null;
  whatsapp: string | null; endereco: string | null;
  capa_url: string | null; descricao: string | null; horario_texto: string | null;
  aceita_entrega: boolean; aceita_retirada: boolean; ativo: boolean;
  formas_pagamento: FormaPagamento[];
  tempo_entrega_min: number | null; tempo_entrega_max: number | null; tempo_retirada: number | null;
  horarios: Horarios | null; config_impressao: ConfigImpressao;
  virada_dia: string; // "05:00:00": fim do dia de trabalho (dia operacional)
  plano_status: PlanoStatus; trial_ate: string | null; origem_cadastro: "self" | "superadmin";
};

// Configurações ▸ Info do negócio: identidade e contato.
export function InfoNegocio({ empresa, mudou }: { empresa: Empresa; mudou: (e: Empresa) => void }) {
  const [salvando, setSalvando] = useState(false);

  async function salvar(f: FormData) {
    const problema = erroSlug(String(f.get("slug")).trim().toLowerCase());
    if (problema) return toast.erro(problema);
    setSalvando(true);
    try {
      const logo = f.get("logo") as File;
      const capa = f.get("capa") as File;
      const campos = {
        nome: String(f.get("nome")).trim(),
        slug: String(f.get("slug")).trim().toLowerCase(),
        whatsapp: String(f.get("whatsapp")).replace(/\D/g, "") || null,
        endereco: String(f.get("endereco")).trim() || null,
        descricao: String(f.get("descricao")).trim() || null,
        cor_primaria: String(f.get("cor_primaria")),
        logo_url: logo.size ? await enviarFoto(supabase, empresa.id, logo) : empresa.logo_url,
        capa_url: capa.size ? await enviarFoto(supabase, empresa.id, capa) : empresa.capa_url,
      };
      if (await ok(supabase.from("empresas").update(campos).eq("id", empresa.id), "Dados do negócio salvos")) {
        mudou({ ...empresa, ...campos });
      }
    } catch (e) {
      toast.erro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); salvar(new FormData(e.currentTarget)); }} className="space-y-4">
      <section className={`${card} space-y-4`}>
        <h2 className="text-lg font-semibold">Identidade</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FotoInput name="logo" atual={empresa.logo_url} titulo="Logo (quadrado)" />
          <FotoInput name="capa" atual={empresa.capa_url} titulo="Capa (paisagem, ex.: 1200×400)" />
        </div>
        <label className="block"><span className={rotulo}>Nome</span>
          <input name="nome" required defaultValue={empresa.nome} className={input} />
        </label>
        <label className="block"><span className={rotulo}>Descrição (aparece no topo do cardápio)</span>
          <textarea name="descricao" rows={2} maxLength={300} defaultValue={empresa.descricao ?? ""} className={`${input} h-auto py-2`} />
        </label>
        <label className="block"><span className={rotulo}>Endereço do cardápio</span>
          <span className="flex items-center rounded-lg border border-neutral-300 focus-within:ring-2 focus-within:ring-rose-500/30 dark:border-neutral-700">
            <span className="pl-3 text-neutral-500">…/</span>
            <input name="slug" required pattern="[a-z0-9\-]{3,40}" title="3 a 40 caracteres: letras minúsculas, números e hífen"
              defaultValue={empresa.slug} className="h-11 w-full min-w-0 rounded-lg bg-transparent px-1 text-base focus:outline-none" />
          </span>
        </label>
        <label className="flex items-center gap-3"><span className="text-sm font-medium">Cor de destaque</span>
          <input name="cor_primaria" type="color" defaultValue={empresa.cor_primaria ?? "#E11D48"}
            className="h-11 w-16 cursor-pointer rounded-lg border border-neutral-300 dark:border-neutral-700" />
        </label>
      </section>

      <section className={`${card} space-y-4`}>
        <h2 className="text-lg font-semibold">Contato</h2>
        <label className="block"><span className={rotulo}>WhatsApp (com DDI e DDD, ex.: 5566999999999)</span>
          <input name="whatsapp" inputMode="tel" defaultValue={empresa.whatsapp ?? ""} className={input} />
        </label>
        <label className="block"><span className={rotulo}>Endereço</span>
          <input name="endereco" defaultValue={empresa.endereco ?? ""} className={input} />
        </label>
      </section>

      <button disabled={salvando} className={`${botao} w-full sm:w-auto`}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
    </form>
  );
}
