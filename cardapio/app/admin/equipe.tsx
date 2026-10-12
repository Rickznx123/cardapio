"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "@/components/toast";
import { Ativo, atualizar, botao, card, input, rotulo, useLista } from "./ui";

type Membro = { id: string; nome: string; papel: "dono" | "garcom" | "caixa"; ativo: boolean };

const papeis = { dono: "Dono", garcom: "Garçom", caixa: "Caixa" };
const corPapel = {
  dono: "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900",
  garcom: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  caixa: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

export function Equipe({ empresaId }: { empresaId: string }) {
  const [lista, recarregar] = useLista<Membro>("membros", empresaId, "nome");
  const [enviando, setEnviando] = useState(false);
  const [papel, setPapel] = useState<"garcom" | "caixa">("garcom");

  async function cadastrar(form: HTMLFormElement) {
    setEnviando(true);
    const r = await fetch("/api/garcom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: empresaId, papel, ...Object.fromEntries(new FormData(form)) }),
    });
    setEnviando(false);
    if (!r.ok) return toast.erro((await r.json().catch(() => ({}))).erro ?? "Erro ao cadastrar");
    toast.ok(`${papeis[papel]} cadastrado`);
    form.reset(); // só limpa no sucesso
    recarregar();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); cadastrar(e.currentTarget); }} className={`${card} space-y-4`}>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800" role="radiogroup" aria-label="Tipo de usuário">
          {(["garcom", "caixa"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={p === papel} onClick={() => setPapel(p)}
              className={`h-10 rounded-lg text-sm font-semibold ${p === papel ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-600 dark:text-neutral-400"}`}>
              Novo {papeis[p].toLowerCase()}
            </button>
          ))}
        </div>
        <label className="block"><span className={rotulo}>Nome</span>
          <input name="nome" required className={input} />
        </label>
        {papel === "garcom" ? (
          <label className="block"><span className={rotulo}>PIN de 6 dígitos (o garçom usa para entrar)</span>
            <input name="pin" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off"
              title="6 dígitos" className={`${input} tracking-[0.4em]`} />
          </label>
        ) : (
          <>
            <label className="block"><span className={rotulo}>E-mail</span>
              <input name="email" type="email" required autoComplete="off" className={input} />
            </label>
            <label className="block"><span className={rotulo}>Senha (mín. 6 caracteres)</span>
              <input name="senha" type="password" required minLength={6} autoComplete="new-password" className={input} />
            </label>
          </>
        )}
        <button disabled={enviando} className={botao}><UserPlus className="size-5" />{enviando ? "Cadastrando…" : "Cadastrar"}</button>
      </form>

      <ul className={`${card} divide-y divide-neutral-200 p-0 dark:divide-neutral-800`}>
        {lista.map((m) => (
          <li key={m.id} className={`flex items-center gap-3 p-3 ${m.ativo ? "" : "opacity-60"}`}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 font-semibold dark:bg-neutral-800">
              {m.nome[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{m.nome}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${corPapel[m.papel]}`}>{papeis[m.papel]}</span>
            {m.papel !== "dono" && (
              <Ativo marcado={m.ativo} rotulo="" salvar={(v) => atualizar("membros", m.id, { ativo: v }).then(recarregar)} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
