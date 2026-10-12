"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Armchair, Bike, ClipboardList, ExternalLink, LogOut, Menu, QrCode, Settings, Users, UtensilsCrossed,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { Bairros } from "./bairros";
import { EditorCardapio } from "./cardapio/editor";
import { ConfigImpressao, type Empresa, EmpresaForm } from "./configuracoes";
import { Equipe } from "./equipe";
import { Mesas } from "./mesas";
import { Pedidos } from "./pedidos";
import { QrModal } from "./qr";
import { supabase } from "./ui";

const SECOES = [
  { nome: "Pedidos", Icone: ClipboardList, papeis: ["dono", "caixa"] },
  { nome: "Cardápio", Icone: UtensilsCrossed, papeis: ["dono"] },
  { nome: "Mesas", Icone: Armchair, papeis: ["dono"] },
  { nome: "Entrega", Icone: Bike, papeis: ["dono"] },
  { nome: "Equipe", Icone: Users, papeis: ["dono"] },
  { nome: "Configurações", Icone: Settings, papeis: ["dono"] },
] as const;
type Secao = (typeof SECOES)[number]["nome"];
type Papel = "dono" | "caixa";

export default function Painel() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>();
  const [papel, setPapel] = useState<Papel>("caixa");
  const [secao, setSecao] = useState<Secao>("Pedidos");
  const [menu, setMenu] = useState(false);
  const [qr, setQr] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      // shortcut: membro de várias empresas vê só a primeira; adicionar seletor quando houver esse caso.
      const { data } = await supabase
        .from("membros")
        .select("papel, empresas(*)")
        .eq("user_id", user.id)
        .in("papel", ["dono", "caixa"])
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      if (data) setPapel(data.papel as Papel);
      setEmpresa((data?.empresas as unknown as Empresa) ?? null);
    })();
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function alternarLoja() {
    if (!empresa) return;
    const aberto = !empresa.aberto;
    const { error } = await supabase.from("empresas").update({ aberto }).eq("id", empresa.id);
    if (error) return toast.erro(error.message);
    setEmpresa({ ...empresa, aberto });
    toast.ok(aberto ? "Loja aberta para pedidos" : "Loja fechada para pedidos");
  }

  if (empresa === undefined) return <p className="p-6">Carregando…</p>;
  if (empresa === null) return <p className="p-6">Este usuário não é dono nem caixa de nenhuma empresa ativa.</p>;

  const secoes = SECOES.filter((s) => (s.papeis as readonly string[]).includes(papel));
  const menuLateral = (
    <MenuLateral empresa={empresa} papel={papel} secoes={secoes} secao={secao}
      ir={(s) => { setSecao(s); setMenu(false); }} alternarLoja={alternarLoja}
      abrirQr={() => { setMenu(false); setQr(true); }} sair={sair} />
  );

  return (
    <div className="flex flex-1 bg-neutral-50 dark:bg-neutral-950">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-neutral-200 bg-white lg:block dark:border-neutral-800 dark:bg-neutral-900">
        {menuLateral}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-neutral-200 bg-white px-2 lg:hidden dark:border-neutral-800 dark:bg-neutral-900">
          <button onClick={() => setMenu(true)} aria-label="Abrir menu" className="flex size-11 items-center justify-center rounded-lg">
            <Menu className="size-6" />
          </button>
          <span className="min-w-0 flex-1 truncate font-bold">{secao}</span>
          <span className={`mr-2 flex items-center gap-1.5 text-xs font-semibold ${empresa.aberto ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
            <span className={`size-2.5 rounded-full ${empresa.aberto ? "bg-emerald-500" : "bg-red-500"}`} />
            {empresa.aberto ? "Aberta" : "Fechada"}
          </span>
        </header>

        {/* Pedidos fica sempre montado: Realtime, alerta e impressão seguem rodando nas outras seções. */}
        <Pedidos equipe={{ empresa_id: empresa.id, nome: empresa.nome }} visivel={secao === "Pedidos"} />

        {secao !== "Pedidos" && (
          <main className={`mx-auto w-full p-4 md:p-8 ${secao === "Cardápio" ? "max-w-4xl" : "max-w-3xl"}`}>
            {/* No Cardápio o topo (capa + nome editável) já faz o papel de título. */}
            {secao === "Cardápio" ? <h1 className="sr-only">Cardápio</h1> : <h1 className="mb-5 text-2xl font-bold">{secao}</h1>}
            {secao === "Cardápio" && <EditorCardapio empresa={empresa} mudou={setEmpresa} />}
            {secao === "Mesas" && <Mesas empresaId={empresa.id} />}
            {secao === "Entrega" && <Bairros empresaId={empresa.id} />}
            {secao === "Equipe" && <Equipe empresaId={empresa.id} />}
            {secao === "Configurações" && (
              <div className="space-y-6">
                <EmpresaForm empresa={empresa} mudou={setEmpresa} />
                <ConfigImpressao />
              </div>
            )}
          </main>
        )}
      </div>

      {menu && <Modal titulo={empresa.nome} fechar={() => setMenu(false)}>{menuLateral}</Modal>}
      {qr && <QrModal slug={empresa.slug} nome={empresa.nome} fechar={() => setQr(false)} />}
    </div>
  );
}

function MenuLateral({ empresa, papel, secoes, secao, ir, alternarLoja, abrirQr, sair }: {
  empresa: Empresa; papel: Papel; secoes: readonly (typeof SECOES)[number][]; secao: Secao;
  ir: (s: Secao) => void; alternarLoja: () => void; abrirQr: () => void; sair: () => void;
}) {
  const item = "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium";
  const neutro = "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800";
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="hidden items-center gap-3 px-1 lg:flex">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-rose-600 font-bold text-white">
          {empresa.logo_url ? <img src={empresa.logo_url} alt="" className="size-full object-cover" /> : empresa.nome[0]}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold">{empresa.nome}</span>
          <span className="block text-xs text-neutral-500 capitalize">{papel}</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Seções do painel">
        {secoes.map(({ nome, Icone }) => (
          <button key={nome} onClick={() => ir(nome)} aria-current={nome === secao ? "page" : undefined}
            className={`${item} ${nome === secao ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : neutro}`}>
            <Icone className="size-5" /> {nome}
          </button>
        ))}
      </nav>

      <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        {papel === "dono" && (
          <button onClick={alternarLoja} role="switch" aria-checked={empresa.aberto}
            className={`flex h-14 w-full items-center justify-between rounded-xl px-4 font-bold text-white ${empresa.aberto ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
            <span>{empresa.aberto ? "Loja aberta" : "Loja fechada"}</span>
            <span className={`flex h-7 w-12 items-center rounded-full bg-white/30 p-1 ${empresa.aberto ? "justify-end" : "justify-start"}`}>
              <span className="size-5 rounded-full bg-white shadow" />
            </span>
          </button>
        )}
        <Link href={`/${empresa.slug}`} target="_blank" className={`${item} ${neutro}`}>
          <ExternalLink className="size-5" /> Ver cardápio
        </Link>
        <button onClick={abrirQr} className={`${item} ${neutro}`}>
          <QrCode className="size-5" /> QR Code e links
        </button>
        <button onClick={sair} className={`${item} ${neutro}`}>
          <LogOut className="size-5" /> Sair
        </button>
      </div>
    </div>
  );
}
