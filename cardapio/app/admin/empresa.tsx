"use client";

import { useState } from "react";
import { enviarFoto } from "@/lib/foto";
import { erroSlug } from "@/lib/slug";
import { botao, input, ok, supabase } from "./ui";

export type Empresa = {
  id: string; nome: string; slug: string; logo_url: string | null; cor_primaria: string | null;
  whatsapp: string | null; endereco: string | null;
  aceita_entrega: boolean; aceita_retirada: boolean; aberto: boolean;
};

export function EmpresaForm({ empresa, mudou }: { empresa: Empresa; mudou: (e: Empresa) => void }) {
  const [salvando, setSalvando] = useState(false);

  async function salvar(f: FormData) {
    const problema = erroSlug(String(f.get("slug")).trim().toLowerCase());
    if (problema) return alert(problema);
    setSalvando(true);
    try {
      const logo = f.get("logo") as File;
      const campos = {
        nome: String(f.get("nome")).trim(),
        slug: String(f.get("slug")).trim().toLowerCase(),
        whatsapp: String(f.get("whatsapp")).replace(/\D/g, "") || null,
        endereco: String(f.get("endereco")).trim() || null,
        cor_primaria: String(f.get("cor_primaria")),
        aceita_entrega: f.get("aceita_entrega") === "on",
        aceita_retirada: f.get("aceita_retirada") === "on",
        aberto: f.get("aberto") === "on",
        logo_url: logo.size ? await enviarFoto(supabase, empresa.id, logo) : empresa.logo_url,
      };
      if (await ok(supabase.from("empresas").update(campos).eq("id", empresa.id))) {
        mudou({ ...empresa, ...campos });
        alert("Salvo!");
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); salvar(new FormData(e.currentTarget)); }} className="space-y-3">
      <label className="block">Nome<input name="nome" required defaultValue={empresa.nome} className={input} /></label>
      <label className="block">Endereço do cardápio (slug)
        <input name="slug" required pattern="[a-z0-9\-]{3,40}" title="3 a 40 caracteres: letras minúsculas, números e hífen"
          defaultValue={empresa.slug} className={input} />
      </label>
      <label className="block">WhatsApp (com DDI e DDD, ex: 5566999999999)
        <input name="whatsapp" inputMode="tel" defaultValue={empresa.whatsapp ?? ""} className={input} />
      </label>
      <label className="block">Endereço<input name="endereco" defaultValue={empresa.endereco ?? ""} className={input} /></label>
      <label className="flex items-center gap-2">Cor
        <input name="cor_primaria" type="color" defaultValue={empresa.cor_primaria ?? "#E11D48"} />
      </label>
      <div className="flex items-center gap-3">
        {empresa.logo_url && <img src={empresa.logo_url} alt="Logo" className="h-16 w-16 rounded object-cover" />}
        <label className="block">Logo<input name="logo" type="file" accept="image/*" className="block text-sm" /></label>
      </div>
      <label className="flex gap-2"><input name="aberto" type="checkbox" defaultChecked={empresa.aberto} />Loja aberta para pedidos</label>
      <label className="flex gap-2"><input name="aceita_entrega" type="checkbox" defaultChecked={empresa.aceita_entrega} />Faz entrega</label>
      <label className="flex gap-2"><input name="aceita_retirada" type="checkbox" defaultChecked={empresa.aceita_retirada} />Aceita retirada</label>
      <button disabled={salvando} className={botao}>{salvando ? "Salvando…" : "Salvar"}</button>
    </form>
  );
}
