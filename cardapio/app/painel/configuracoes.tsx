"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { toast } from "@/components/toast";
import { useArmazenado } from "@/lib/armazenado";
import { enviarFoto } from "@/lib/foto";
import { erroSlug } from "@/lib/slug";
import { botao, card, FotoInput, input, ok, rotulo, supabase } from "./ui";

export type Empresa = {
  id: string; nome: string; slug: string; logo_url: string | null; cor_primaria: string | null;
  whatsapp: string | null; endereco: string | null;
  capa_url: string | null; descricao: string | null; horario_texto: string | null;
  aceita_entrega: boolean; aceita_retirada: boolean; aberto: boolean;
};

const opcao = "flex cursor-pointer items-center justify-between gap-3 py-3";
const check = "size-5 accent-rose-600";

export function EmpresaForm({ empresa, mudou }: { empresa: Empresa; mudou: (e: Empresa) => void }) {
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
        horario_texto: String(f.get("horario_texto")).trim() || null,
        cor_primaria: String(f.get("cor_primaria")),
        aceita_entrega: f.get("aceita_entrega") === "on",
        aceita_retirada: f.get("aceita_retirada") === "on",
        logo_url: logo.size ? await enviarFoto(supabase, empresa.id, logo) : empresa.logo_url,
        capa_url: capa.size ? await enviarFoto(supabase, empresa.id, capa) : empresa.capa_url,
      };
      if (await ok(supabase.from("empresas").update(campos).eq("id", empresa.id), "Dados da empresa salvos")) {
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
        <label className="block"><span className={rotulo}>Descrição (aparece no topo do cardápio)</span>
          <textarea name="descricao" rows={2} maxLength={300} defaultValue={empresa.descricao ?? ""} className={`${input} h-auto py-2`} />
        </label>
        <label className="block"><span className={rotulo}>Nome</span>
          <input name="nome" required defaultValue={empresa.nome} className={input} />
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
        <label className="block"><span className={rotulo}>Horário de funcionamento</span>
          <input name="horario_texto" placeholder="Ex.: Ter a Dom, 18h às 23h" defaultValue={empresa.horario_texto ?? ""} className={input} />
        </label>
      </section>

      <section className={`${card} divide-y divide-neutral-200 py-1 dark:divide-neutral-800`}>
        <label className={opcao}><span className="font-medium">Faz entrega</span>
          <input name="aceita_entrega" type="checkbox" defaultChecked={empresa.aceita_entrega} className={check} />
        </label>
        <label className={opcao}><span className="font-medium">Aceita retirada</span>
          <input name="aceita_retirada" type="checkbox" defaultChecked={empresa.aceita_retirada} className={check} />
        </label>
      </section>

      <button disabled={salvando} className={`${botao} w-full sm:w-auto`}>{salvando ? "Salvando…" : "Salvar alterações"}</button>
    </form>
  );
}

// Impressão é por aparelho (localStorage): cada PC do balcão decide se imprime sozinho.
export function ConfigImpressao() {
  const [auto, setAuto] = useArmazenado("balcao:impressao-automatica", true);
  return (
    <section className={`${card} space-y-3`}>
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Printer className="size-5" /> Impressão</h2>
      <label className={opcao}>
        <span><span className="block font-medium">Impressão automática neste aparelho</span>
          <span className="text-sm text-neutral-500">Cada pedido novo sai na impressora padrão assim que chega.</span></span>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className={check} />
      </label>
      <Link href="/painel/impressao" className="inline-flex items-center gap-1 text-sm font-medium text-rose-600 hover:underline">
        Como configurar a impressora térmica (Chrome em modo quiosque) →
      </Link>
    </section>
  );
}
