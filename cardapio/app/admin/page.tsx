"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Armchair, Building2, ExternalLink, LogOut, MapPinned, MonitorSmartphone, Tags, Users, UtensilsCrossed } from "lucide-react";
import { Bairros } from "./bairros";
import { Categorias } from "./categorias";
import { type Empresa, EmpresaForm } from "./empresa";
import { Equipe } from "./equipe";
import { Itens } from "./itens";
import { Mesas } from "./mesas";
import { supabase } from "./ui";

const abas = [
  { nome: "Itens", Icone: UtensilsCrossed },
  { nome: "Categorias", Icone: Tags },
  { nome: "Bairros", Icone: MapPinned },
  { nome: "Mesas", Icone: Armchair },
  { nome: "Equipe", Icone: Users },
  { nome: "Empresa", Icone: Building2 },
] as const;
type Aba = (typeof abas)[number]["nome"];

const linkLateral = "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium";

export default function Admin() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>();
  const [aba, setAba] = useState<Aba>("Itens");

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

  if (empresa === undefined) return <p className="p-6">Carregando…</p>;
  if (empresa === null) return <p className="p-6">Nenhuma empresa vinculada a este usuário como dono.</p>;

  const atual = abas.find((a) => a.nome === aba)!;

  return (
    <div className="flex flex-1 bg-neutral-50 dark:bg-neutral-950">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 md:flex dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 px-3">
          <p className="truncate text-lg font-bold">{empresa.nome}</p>
          <Link href={`/${empresa.slug}`} target="_blank" className="flex items-center gap-1 text-sm text-neutral-500 hover:underline">
            Ver cardápio <ExternalLink className="size-3.5" />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Seções">
          {abas.map(({ nome, Icone }) => (
            <button key={nome} onClick={() => setAba(nome)} aria-current={nome === aba ? "page" : undefined}
              className={`${linkLateral} ${nome === aba
                ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"}`}>
              <Icone className="size-5" /> {nome}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <Link href="/balcao" className={`${linkLateral} text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`}>
            <MonitorSmartphone className="size-5" /> Balcão
          </Link>
          <button onClick={sair} className={`${linkLateral} text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`}>
            <LogOut className="size-5" /> Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-900/95">
          <div className="flex items-center gap-2 px-4 pt-3">
            <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{empresa.nome}</h1>
            <Link href="/balcao" aria-label="Balcão" className="flex size-10 items-center justify-center rounded-lg"><MonitorSmartphone className="size-5" /></Link>
            <button onClick={sair} aria-label="Sair" className="flex size-10 items-center justify-center rounded-lg"><LogOut className="size-5" /></button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none]" aria-label="Seções">
            {abas.map(({ nome, Icone }) => (
              <button key={nome} onClick={() => setAba(nome)} aria-current={nome === aba ? "page" : undefined}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium ${
                  nome === aba ? "bg-rose-600 text-white" : "text-neutral-600 dark:text-neutral-300"}`}>
                <Icone className="size-4" /> {nome}
              </button>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-3xl p-4 md:p-8">
          <h2 className="mb-4 hidden items-center gap-2 text-2xl font-bold md:flex">
            <atual.Icone className="size-6 text-rose-600" /> {aba}
          </h2>
          {aba === "Itens" && <Itens empresaId={empresa.id} />}
          {aba === "Categorias" && <Categorias empresaId={empresa.id} />}
          {aba === "Bairros" && <Bairros empresaId={empresa.id} />}
          {aba === "Mesas" && <Mesas empresaId={empresa.id} />}
          {aba === "Equipe" && <Equipe empresaId={empresa.id} />}
          {aba === "Empresa" && <EmpresaForm empresa={empresa} mudou={setEmpresa} />}
        </main>
      </div>
    </div>
  );
}
