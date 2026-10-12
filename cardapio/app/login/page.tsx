"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const destino = { dono: "/admin", caixa: "/balcao" } as const;

export default function Login() {
  const router = useRouter();
  const [erro, setErro] = useState("");

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

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form action={entrar} className="w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-bold">Entrar</h1>
        <input name="email" type="email" required placeholder="E-mail" autoComplete="email"
          className="w-full rounded border p-3" />
        <input name="senha" type="password" required placeholder="Senha" autoComplete="current-password"
          className="w-full rounded border p-3" />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="w-full rounded bg-rose-600 p-3 font-semibold text-white">Entrar</button>
      </form>
    </main>
  );
}
