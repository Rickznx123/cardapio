"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/toast";
import { brl } from "@/lib/tipos";
import { supabase } from "./ui";

type Tipo = "percentual" | "valor" | "frete_gratis";
type Cupom = {
  id: string; codigo: string; tipo: Tipo; valor: number; pedido_minimo: number; validade: string | null;
  usos_max: number | null; usos: number; ativo: boolean; origem: string; cliente_id: string | null;
};
type Cliente = { id: string; nome: string | null; telefone: string };
type Formulario = { id?: string; codigo: string; tipo: Tipo; valor: string; pedido_minimo: string; validade: string; usos_max: string; cliente_id: string };
const vazio = (): Formulario => ({ codigo: "", tipo: "percentual", valor: "15", pedido_minimo: "0", validade: "", usos_max: "", cliente_id: "" });

export function Cupons({ empresaId }: { empresaId: string }) {
  const [cupons, setCupons] = useState<Cupom[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [form, setForm] = useState<Formulario>(vazio);
  const [salvando, setSalvando] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    Promise.all([
      supabase.from("cupons").select("*").eq("empresa_id", empresaId).eq("origem", "manual").order("created_at", { ascending: false }),
      supabase.from("clientes").select("id,nome,telefone").eq("empresa_id", empresaId).order("nome").limit(1000),
    ]).then(([c, cl]) => {
      if (c.error) toast.erro(c.error.message); else setCupons((c.data ?? []) as Cupom[]);
      if (cl.error) toast.erro(cl.error.message); else setClientes((cl.data ?? []) as Cliente[]);
    });
  }, [empresaId, versao]);

  function editar(c: Cupom) {
    setForm({
      id: c.id, codigo: c.codigo, tipo: c.tipo, valor: String(c.valor), pedido_minimo: String(c.pedido_minimo),
      validade: c.validade ? new Date(c.validade).toISOString().slice(0, 10) : "",
      usos_max: c.usos_max == null ? "" : String(c.usos_max), cliente_id: c.cliente_id ?? "",
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const validade = form.validade ? new Date(`${form.validade}T23:59:59`).toISOString() : null;
    const payload = {
      empresa_id: empresaId, codigo: form.codigo.trim().toUpperCase(), tipo: form.tipo,
      valor: form.tipo === "frete_gratis" ? 0 : Number(form.valor),
      pedido_minimo: Number(form.pedido_minimo) || 0, validade,
      usos_max: form.usos_max ? Number(form.usos_max) : null, cliente_id: form.cliente_id || null,
      origem: "manual" as const,
    };
    const resultado = form.id
      ? await supabase.from("cupons").update(payload).eq("id", form.id)
      : await supabase.from("cupons").insert(payload);
    setSalvando(false);
    if (resultado.error) return toast.erro(resultado.error.message);
    toast.ok(form.id ? "Cupom atualizado" : "Cupom criado");
    setForm(vazio());
    setVersao((v) => v + 1);
  }

  async function alternar(c: Cupom) {
    const { error } = await supabase.from("cupons").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) return toast.erro(error.message);
    setVersao((v) => v + 1);
  }

  async function remover(c: Cupom) {
    if (!confirm(`Excluir o cupom ${c.codigo}?`)) return;
    const { error } = await supabase.from("cupons").delete().eq("id", c.id);
    if (error) return toast.erro(error.message);
    toast.ok("Cupom excluído");
    setVersao((v) => v + 1);
  }

  const campo = "h-11 w-full rounded-lg border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900";
  return (
    <div className="space-y-5">
      <form onSubmit={salvar} className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Código</span>
          <input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_-]+" value={form.codigo}
            onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })} className={campo} placeholder="BEMVINDO" />
        </label>
        <label><span className="mb-1 block text-sm font-medium">Tipo</span>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Tipo })} className={campo}>
            <option value="percentual">Percentual</option><option value="valor">Valor em reais</option><option value="frete_gratis">Frete grátis</option>
          </select>
        </label>
        {form.tipo !== "frete_gratis" && <label><span className="mb-1 block text-sm font-medium">{form.tipo === "percentual" ? "Percentual (%)" : "Desconto (R$)"}</span>
          <input required type="number" min="0" max={form.tipo === "percentual" ? 100 : undefined} step="0.01" value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })} className={campo} />
        </label>}
        <label><span className="mb-1 block text-sm font-medium">Pedido mínimo (R$)</span>
          <input type="number" min="0" step="0.01" value={form.pedido_minimo} onChange={(e) => setForm({ ...form, pedido_minimo: e.target.value })} className={campo} />
        </label>
        <label><span className="mb-1 block text-sm font-medium">Validade (opcional)</span>
          <input type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} className={campo} />
        </label>
        <label><span className="mb-1 block text-sm font-medium">Limite de usos (vazio = ilimitado)</span>
          <input type="number" min="1" value={form.usos_max} onChange={(e) => setForm({ ...form, usos_max: e.target.value })} className={campo} />
        </label>
        <label className="sm:col-span-2"><span className="mb-1 block text-sm font-medium">Cliente exclusivo (opcional)</span>
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className={campo}>
            <option value="">Qualquer cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome || c.telefone} · {c.telefone}</option>)}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <button disabled={salvando} className="inline-flex h-11 items-center gap-2 rounded-lg bg-rose-600 px-4 font-semibold text-white disabled:opacity-50">
            {form.id ? <Pencil className="size-4" /> : <Plus className="size-4" />}{salvando ? "Salvando…" : form.id ? "Salvar alterações" : "Criar cupom"}
          </button>
          {form.id && <button type="button" onClick={() => setForm(vazio())} className="h-11 rounded-lg border border-neutral-300 px-4 dark:border-neutral-700">Cancelar edição</button>}
        </div>
      </form>
      <ul className="space-y-2">
        {cupons.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="min-w-0 flex-1"><b className="font-mono">{c.codigo}</b>
            <p className="text-sm text-neutral-500">
              {c.tipo === "frete_gratis" ? "Frete grátis" : c.tipo === "percentual" ? `${c.valor}%` : brl(Number(c.valor))}
              {Number(c.pedido_minimo) > 0 && ` · mínimo ${brl(Number(c.pedido_minimo))}`}
              {` · usos ${c.usos}${c.usos_max == null ? "" : `/${c.usos_max}`}`}
              {c.validade ? ` · até ${new Date(c.validade).toLocaleDateString("pt-BR")}` : ""}
            </p>
          </div>
          <button onClick={() => void alternar(c)} className={`rounded-full px-3 py-1 text-xs font-semibold ${c.ativo ? "bg-emerald-100 text-emerald-800" : "bg-neutral-200 text-neutral-700"}`}>
            {c.ativo ? "Ativo" : "Pausado"}
          </button>
          <button onClick={() => editar(c)} aria-label={`Editar ${c.codigo}`} className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><Pencil className="size-4" /></button>
          <button onClick={() => void remover(c)} aria-label={`Excluir ${c.codigo}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="size-4" /></button>
        </li>)}
        {!cupons.length && <li className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">Nenhum cupom manual cadastrado.</li>}
      </ul>
    </div>
  );
}
