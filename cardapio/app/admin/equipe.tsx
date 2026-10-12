"use client";

import { useState } from "react";
import { Ativo, atualizar, botao, input, useLista } from "./ui";

type Membro = { id: string; nome: string; papel: "dono" | "garcom" | "caixa"; ativo: boolean };

const papeis = { dono: "Dono", garcom: "Garçom", caixa: "Caixa" };

export function Equipe({ empresaId }: { empresaId: string }) {
  const [lista, recarregar] = useLista<Membro>("membros", empresaId, "nome");
  const [enviando, setEnviando] = useState(false);
  const [papel, setPapel] = useState<"garcom" | "caixa">("garcom");

  async function cadastrar(f: FormData) {
    setEnviando(true);
    const r = await fetch("/api/garcom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: empresaId, papel, ...Object.fromEntries(f) }),
    });
    setEnviando(false);
    if (r.ok) recarregar();
    else alert((await r.json().catch(() => ({}))).erro ?? "Erro ao cadastrar");
  }

  return (
    <div className="space-y-4">
      <form action={cadastrar} className="space-y-2 rounded border p-3">
        <div className="flex gap-2">
          {(["garcom", "caixa"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPapel(p)}
              className={`rounded-full px-4 py-1 text-sm ${p === papel ? "bg-rose-600 text-white" : "border"}`}>
              Novo {papeis[p].toLowerCase()}
            </button>
          ))}
        </div>
        <input name="nome" required placeholder="Nome" className={input} />
        {papel === "garcom" ? (
          <input name="pin" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off"
            placeholder="PIN (6 dígitos)" title="6 dígitos" className={input} />
        ) : (
          <>
            <input name="email" type="email" required placeholder="E-mail" autoComplete="off" className={input} />
            <input name="senha" type="password" required minLength={6} placeholder="Senha (mín. 6)"
              autoComplete="new-password" className={input} />
          </>
        )}
        <button disabled={enviando} className={botao}>{enviando ? "Cadastrando…" : "Cadastrar"}</button>
      </form>
      <ul className="space-y-2">
        {lista.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded border p-2">
            <span>{m.nome} <span className="text-sm text-gray-500">· {papeis[m.papel]}</span></span>
            {m.papel !== "dono" && (
              <Ativo marcado={m.ativo} salvar={(v) => atualizar("membros", m.id, { ativo: v })} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
