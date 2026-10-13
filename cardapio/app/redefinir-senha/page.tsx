"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/client";

// Destino do link "Esqueci minha senha". O client do Supabase troca o ?code= da URL por uma sessão ao iniciar.
export default function RedefinirSenha() {
  const router = useRouter();
  const [valido, setValido] = useState<boolean>();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setValido(!!data.session));
  }, []);

  async function salvar(f: FormData) {
    const senha = String(f.get("senha"));
    if (senha.length < 8) return setErro("A senha precisa ter pelo menos 8 caracteres");
    if (senha !== f.get("confirmar")) return setErro("As senhas não conferem");
    setErro("");
    setEnviando(true);
    const { error } = await createClient().auth.updateUser({ password: senha });
    setEnviando(false);
    if (error) return setErro(error.code === "same_password" ? "Use uma senha diferente da anterior" : error.message);
    toast.ok("Senha alterada");
    router.replace("/painel");
  }

  const campo = "h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <main className="flex flex-1 items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-950">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-rose-600">
          <UtensilsCrossed className="size-6" />
          <span className="font-bold">Cardápio Digital</span>
        </div>
        <h1 className="text-2xl font-bold">Nova senha</h1>
        {valido === undefined ? (
          <p className="text-neutral-500">Verificando link…</p>
        ) : !valido ? (
          <>
            <p className="text-neutral-600 dark:text-neutral-400">
              Este link expirou ou já foi usado. Peça um novo em &quot;Esqueci minha senha&quot;, no mesmo navegador.
            </p>
            <Link href="/login" className="block h-12 w-full rounded-lg bg-rose-600 text-center leading-[3rem] font-semibold text-white">Ir para o login</Link>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); salvar(new FormData(e.currentTarget)); }} className="space-y-4">
            <label className="block"><span className="mb-1 block text-sm font-medium">Nova senha (mín. 8 caracteres)</span>
              <input name="senha" type="password" required minLength={8} autoComplete="new-password" className={campo} />
            </label>
            <label className="block"><span className="mb-1 block text-sm font-medium">Repita a nova senha</span>
              <input name="confirmar" type="password" required minLength={8} autoComplete="new-password" className={campo} />
            </label>
            {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
            <button disabled={enviando} className="h-12 w-full rounded-lg bg-rose-600 font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
              {enviando ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
