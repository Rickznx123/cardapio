"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { Modal } from "@/components/modal";
import { PRODUTO } from "@/lib/marca";
import { createClient } from "@/lib/supabase/client";

const destino = { dono: "/painel", caixa: "/painel" } as const;

export default function Login() {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [esqueci, setEsqueci] = useState(false);

  async function entrar(form: FormData) {
    setErro("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("senha")),
    });
    if (error) return setErro("E-mail ou senha inválidos");

    const { data: membro } = await supabase
      .from("membros")
      .select("papel, empresas(slug)")
      .eq("user_id", data.user.id)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();
    if (!membro) {
      await supabase.auth.signOut();
      return setErro("Usuário sem empresa vinculada");
    }
    if (membro.papel === "garcom") {
      return router.push(`/${(membro.empresas as unknown as { slug: string }).slug}/garcom`);
    }
    router.push(destino[membro.papel as keyof typeof destino]);
  }

  const campo = "h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-neutral-700 dark:bg-neutral-950";

  return (
    <main className="flex flex-1 items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-950">
      <form onSubmit={async (e) => { e.preventDefault(); setEnviando(true); await entrar(new FormData(e.currentTarget)); setEnviando(false); }}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-rose-600">
          <UtensilsCrossed className="size-6" />
          <span className="font-bold">{PRODUTO}</span>
        </div>
        <h1 className="text-2xl font-bold">Entrar</h1>
        <label className="block"><span className="mb-1 block text-sm font-medium">E-mail</span>
          <input name="email" type="email" required autoComplete="email" className={campo} />
        </label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Senha</span>
          <input name="senha" type="password" required autoComplete="current-password" className={campo} />
        </label>
        {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
        <button disabled={enviando} className="h-12 w-full rounded-lg bg-rose-600 font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        <button type="button" onClick={() => setEsqueci(true)} className="w-full text-center text-sm font-medium text-rose-700 hover:underline dark:text-rose-400">
          Esqueci minha senha
        </button>
        <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
          Ainda não tem conta? <Link href="/cadastro" className="font-semibold text-rose-700 dark:text-rose-400">Teste grátis</Link>
        </p>
        <p className="text-center text-xs text-neutral-500">Garçom? Entre pelo app da sua loja: <b>/sua-loja/garcom</b></p>
      </form>
      {esqueci && <EsqueciSenha campo={campo} fechar={() => setEsqueci(false)} />}
    </main>
  );
}

// Envia o link de redefinição (Supabase). Resposta igual exista ou não o e-mail, para não revelar quem tem conta.
function EsqueciSenha({ campo, fechar }: { campo: string; fechar: () => void }) {
  const [estado, setEstado] = useState<"form" | "enviando" | "enviado">("form");

  async function enviar(email: string) {
    setEstado("enviando");
    const { error } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/redefinir-senha` });
    if (error?.status === 429) {
      setEstado("form");
      return alert("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
    }
    setEstado("enviado");
  }

  return (
    <Modal titulo="Redefinir senha" fechar={fechar}>
      {estado === "enviado" ? (
        <div className="space-y-4 p-5">
          <p>Se houver uma conta com esse e-mail, você vai receber um link para criar uma nova senha. Confira também o spam.</p>
          <Link href="/login" onClick={fechar} className="block text-center font-medium text-rose-700 dark:text-rose-400">Voltar ao login</Link>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); enviar(String(new FormData(e.currentTarget).get("email"))); }} className="space-y-4 p-5">
          <label className="block"><span className="mb-1 block text-sm font-medium">E-mail da sua conta</span>
            <input name="email" type="email" required autoComplete="email" className={campo} />
          </label>
          <button disabled={estado === "enviando"} className="h-12 w-full rounded-lg bg-rose-600 font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
            {estado === "enviando" ? "Enviando…" : "Enviar link"}
          </button>
        </form>
      )}
    </Modal>
  );
}
