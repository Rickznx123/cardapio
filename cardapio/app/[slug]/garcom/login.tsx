"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Garcom = { id: string; nome: string };

export function LoginGarcom({ slug }: { slug: string }) {
  const [garcons, setGarcons] = useState<Garcom[] | null>(null);
  const [escolhido, setEscolhido] = useState<Garcom | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    createClient().rpc("listar_garcons", { p_slug: slug })
      .then(({ data, error }) => (error ? setErro(error.message) : setGarcons(data ?? [])));
  }, [slug]);

  async function entrar(f: FormData) {
    setErro("");
    setEnviando(true);
    const r = await fetch("/api/garcom/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membro_id: escolhido!.id, pin: f.get("pin") }),
    });
    if (r.ok) return window.location.reload(); // recarrega para o client ler os cookies novos
    setEnviando(false);
    setErro((await r.json().catch(() => ({}))).erro ?? "Erro ao entrar");
  }

  if (escolhido) {
    return (
      <main className="mx-auto w-full max-w-sm space-y-4 p-4">
        <button onClick={() => { setEscolhido(null); setErro(""); }} className="text-sm underline">← Trocar garçom</button>
        <h1 className="text-2xl font-bold">Olá, {escolhido.nome}</h1>
        <form action={entrar} className="space-y-3">
          <input name="pin" required autoFocus type="password" inputMode="numeric" pattern="\d{6}" maxLength={6}
            autoComplete="off" placeholder="PIN" aria-label="PIN de 6 dígitos"
            className="w-full rounded border p-4 text-center text-2xl tracking-[0.5em]" />
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <button disabled={enviando} className="w-full rounded bg-rose-600 p-4 font-semibold text-white disabled:opacity-50">
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-bold">Quem é você?</h1>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {garcons === null ? (
        <p>Carregando…</p>
      ) : garcons.length === 0 ? (
        <p>Nenhum garçom cadastrado.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {garcons.map((g) => (
            <li key={g.id}>
              <button onClick={() => setEscolhido(g)} className="w-full rounded-lg border p-4 text-lg font-semibold">
                {g.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
