"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bairros } from "./bairros";
import { Categorias } from "./categorias";
import { type Empresa, EmpresaForm } from "./empresa";
import { Equipe } from "./equipe";
import { Itens } from "./itens";
import { Mesas } from "./mesas";
import { supabase } from "./ui";

const abas = ["Itens", "Categorias", "Bairros", "Mesas", "Equipe", "Empresa"] as const;

export default function Admin() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>();
  const [aba, setAba] = useState<(typeof abas)[number]>("Itens");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      // shortcut: dono com várias empresas vê só a primeira; adicionar seletor quando houver esse caso.
      const { data } = await supabase
        .from("membros")
        .select("empresas(*)")
        .eq("user_id", user.id)
        .eq("papel", "dono")
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      setEmpresa((data?.empresas as unknown as Empresa) ?? null);
    })();
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (empresa === undefined) return <p className="p-4">Carregando…</p>;
  if (empresa === null) return <p className="p-4">Nenhuma empresa vinculada a este usuário como dono.</p>;

  return (
    <main className="mx-auto w-full max-w-2xl p-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="truncate text-xl font-bold">{empresa.nome}</h1>
        <div className="flex shrink-0 gap-3 text-sm">
          <Link href="/balcao" className="underline">Balcão</Link>
          <button onClick={sair} className="underline">Sair</button>
        </div>
      </header>
      <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {abas.map((a) => (
          <button key={a} onClick={() => setAba(a)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm ${a === aba ? "bg-rose-600 text-white" : "border"}`}>
            {a}
          </button>
        ))}
      </nav>
      {aba === "Itens" && <Itens empresaId={empresa.id} />}
      {aba === "Categorias" && <Categorias empresaId={empresa.id} />}
      {aba === "Bairros" && <Bairros empresaId={empresa.id} />}
      {aba === "Mesas" && <Mesas empresaId={empresa.id} />}
      {aba === "Equipe" && <Equipe empresaId={empresa.id} />}
      {aba === "Empresa" && <EmpresaForm empresa={empresa} mudou={setEmpresa} />}
    </main>
  );
}
