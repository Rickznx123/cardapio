"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Delete } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Garcom = { id: string; nome: string };

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "apagar"] as const;

export function LoginGarcom({ slug }: { slug: string }) {
  const [garcons, setGarcons] = useState<Garcom[] | null>(null);
  const [escolhido, setEscolhido] = useState<Garcom | null>(null);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    createClient().rpc("listar_garcons", { p_slug: slug })
      .then(({ data, error }) => (error ? setErro(error.message) : setGarcons(data ?? [])));
  }, [slug]);

  async function entrar(codigo: string) {
    setErro("");
    setEnviando(true);
    const r = await fetch("/api/garcom/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membro_id: escolhido!.id, pin: codigo }),
    });
    if (r.ok) return window.location.reload(); // recarrega para o client ler os cookies novos
    setEnviando(false);
    setPin("");
    navigator.vibrate?.([60, 40, 60]);
    setErro((await r.json().catch(() => ({}))).erro ?? "Erro ao entrar");
  }

  function tecla(t: string) {
    if (enviando) return;
    if (t === "apagar") return setPin((p) => p.slice(0, -1));
    const novo = (pin + t).slice(0, 6);
    setPin(novo);
    if (novo.length === 6) entrar(novo);
  }

  // Teclado físico também funciona (útil para testar no PC).
  useEffect(() => {
    if (!escolhido) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === "Backspace") tecla("apagar");
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  });

  if (escolhido) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col p-4">
        <button onClick={() => { setEscolhido(null); setPin(""); setErro(""); }}
          className="flex h-12 items-center gap-1 self-start pr-3 font-medium">
          <ChevronLeft className="size-6" /> Trocar
        </button>
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-neutral-500 dark:text-neutral-400">Olá,</p>
            <h1 className="text-3xl font-bold">{escolhido.nome}</h1>
          </div>
          <div className="flex gap-3" role="img" aria-label={`${pin.length} de 6 dígitos`}>
            {Array.from({ length: 6 }, (_, n) => (
              <span key={n} className={`size-4 rounded-full ${n < pin.length ? "bg-rose-600" : "border-2 border-neutral-300 dark:border-neutral-600"}`} />
            ))}
          </div>
          <p role="alert" className="h-5 text-sm font-medium text-red-600">{enviando ? "" : erro}</p>
          <div className="grid w-full grid-cols-3 gap-3">
            {TECLAS.map((t, n) =>
              t === "" ? <span key={n} /> : (
                <button key={n} onClick={() => tecla(t)} disabled={enviando}
                  aria-label={t === "apagar" ? "Apagar" : t}
                  className="flex h-18 items-center justify-center rounded-2xl bg-neutral-100 text-3xl font-semibold active:bg-neutral-300 disabled:opacity-50 dark:bg-neutral-800 dark:active:bg-neutral-700">
                  {t === "apagar" ? <Delete className="size-7" /> : t}
                </button>
              ),
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-5 p-4">
      <h1 className="pt-6 text-3xl font-bold">Quem é você?</h1>
      {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
      {garcons === null ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((n) => <div key={n} className="h-28 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />)}
        </div>
      ) : garcons.length === 0 ? (
        <p className="text-neutral-500">Nenhum garçom cadastrado. Peça ao dono para cadastrar no admin.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {garcons.map((g) => (
            <li key={g.id}>
              <button onClick={() => setEscolhido(g)}
                className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-neutral-200 font-semibold active:bg-neutral-100 dark:border-neutral-700 dark:active:bg-neutral-800">
                <span className="flex size-12 items-center justify-center rounded-full bg-rose-600 text-xl text-white">
                  {g.nome[0]?.toUpperCase()}
                </span>
                <span className="max-w-full truncate px-2 text-lg">{g.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
