"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Armchair, BarChart3, Bike, ChevronDown, ClipboardList, CreditCard, ExternalLink, History, Info, LogOut, Menu, MessageCircle, Printer, QrCode,
  Settings, SlidersHorizontal, TrendingUp, Users, UtensilsCrossed, Wallet,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { Bairros } from "./bairros";
import { EditorCardapio } from "./cardapio/editor";
import { Gerais } from "./config/gerais";
import { Impressao } from "./config/impressao";
import { Pagamentos } from "./config/pagamentos";
import { type Empresa, InfoNegocio } from "./configuracoes";
import { Equipe } from "./equipe";
import { Mesas } from "./mesas";
import { Pedidos } from "./pedidos";
import { QrModal } from "./qr";
import { supabase } from "./ui";
import { Caixas } from "./vendas/caixas";
import { Historico } from "./vendas/historico";
import { Relatorios } from "./vendas/relatorios";
import { WhatsApp } from "./whatsapp";

type Papel = "dono" | "caixa";
type Item = { id: string; nome: string; Icone: typeof Menu; papeis: readonly Papel[] };
type Grupo = { grupo: string; Icone: typeof Menu; itens: Item[] };
const TODOS = ["dono", "caixa"] as const;
const DONO = ["dono"] as const;

// Sidebar: itens soltos e grupos recolhíveis. `id` vai para a URL (?secao=).
const MENU: (Item | Grupo)[] = [
  { id: "pedidos", nome: "Pedidos", Icone: ClipboardList, papeis: TODOS },
  { grupo: "Vendas", Icone: TrendingUp, itens: [
    { id: "historico", nome: "Histórico de pedidos", Icone: History, papeis: TODOS },
    { id: "caixas", nome: "Caixas", Icone: Wallet, papeis: TODOS },
    { id: "relatorios", nome: "Relatórios", Icone: BarChart3, papeis: TODOS },
  ] },
  { id: "cardapio", nome: "Cardápio", Icone: UtensilsCrossed, papeis: DONO },
  { id: "mesas", nome: "Mesas", Icone: Armchair, papeis: DONO },
  { id: "entrega", nome: "Entrega", Icone: Bike, papeis: DONO },
  { id: "whatsapp", nome: "WhatsApp", Icone: MessageCircle, papeis: DONO },
  { grupo: "Configurações", Icone: Settings, itens: [
    { id: "gerais", nome: "Gerais", Icone: SlidersHorizontal, papeis: DONO },
    { id: "pagamentos", nome: "Métodos de pagamento", Icone: CreditCard, papeis: DONO },
    { id: "info", nome: "Info do negócio", Icone: Info, papeis: DONO },
    { id: "equipe", nome: "Equipe e funções", Icone: Users, papeis: DONO },
    { id: "impressao", nome: "Impressoras e tickets", Icone: Printer, papeis: DONO },
  ] },
];
const ehGrupo = (x: Item | Grupo): x is Grupo => "grupo" in x;
const ITENS = MENU.flatMap((x) => (ehGrupo(x) ? x.itens : [x]));

// Seção inicial pela URL (?secao=impressao etc.). Só roda no navegador: a página é client-only até carregar a empresa.
const secaoDaUrl = () => (typeof window === "undefined" ? null : new URLSearchParams(location.search).get("secao"));

export default function Painel() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | null>();
  const [papel, setPapel] = useState<Papel>("caixa");
  const [secao, setSecao] = useState<string>(() => secaoDaUrl() ?? "pedidos");
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

  function ir(id: string) {
    setSecao(id);
    setMenu(false);
    history.replaceState(null, "", id === "pedidos" ? "/painel" : `/painel?secao=${id}`);
  }

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function alternarLoja() {
    if (!empresa) return;
    const aberto = !empresa.aberto;
    const { error } = await supabase.rpc("alternar_loja", { p_empresa_id: empresa.id, p_aberto: aberto });
    if (error) return toast.erro(error.message);
    setEmpresa({ ...empresa, aberto });
    toast.ok(aberto ? "Loja aberta para pedidos" : "Loja fechada para pedidos");
  }

  if (empresa === undefined) return <p className="p-6">Carregando…</p>;
  if (empresa === null) return <p className="p-6">Este usuário não é dono nem caixa de nenhuma empresa ativa.</p>;
  if (!empresa.ativo) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-neutral-50 p-6 text-center dark:bg-neutral-950">
        <h1 className="text-xl font-bold">{empresa.nome}: conta desativada</h1>
        <p className="max-w-sm text-neutral-600 dark:text-neutral-400">
          O painel e o cardápio estão bloqueados. Fale com o suporte da plataforma para reativar.
        </p>
        <button onClick={sair} className="h-11 rounded-lg border border-neutral-300 px-4 font-medium dark:border-neutral-700">Sair</button>
      </main>
    );
  }

  const permitido = (i: Item) => i.papeis.includes(papel);
  const atual = ITENS.find((i) => i.id === secao && permitido(i)) ?? ITENS[0];
  const menuLateral = (
    <MenuLateral empresa={empresa} papel={papel} atual={atual.id} permitido={permitido} ir={ir}
      alternarLoja={alternarLoja} abrirQr={() => { setMenu(false); setQr(true); }} sair={sair} />
  );
  const largo = ["cardapio", "historico", "relatorios", "impressao", "whatsapp"].includes(atual.id);
  const props = { empresa, mudou: setEmpresa };
  const formas = empresa.formas_pagamento;
  const config = empresa.config_impressao;
  const virada = empresa.virada_dia?.slice(0, 5) ?? "05:00";

  return (
    <div className="flex flex-1 bg-neutral-50 dark:bg-neutral-950">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white lg:block dark:border-neutral-800 dark:bg-neutral-900">
        {menuLateral}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-neutral-200 bg-white px-2 lg:hidden dark:border-neutral-800 dark:bg-neutral-900">
          <button onClick={() => setMenu(true)} aria-label="Abrir menu" className="flex size-11 items-center justify-center rounded-lg">
            <Menu className="size-6" />
          </button>
          <span className="min-w-0 flex-1 truncate font-bold">{atual.nome}</span>
          <span className={`mr-2 flex items-center gap-1.5 text-xs font-semibold ${empresa.aberto ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
            <span className={`size-2.5 rounded-full ${empresa.aberto ? "bg-emerald-500" : "bg-red-500"}`} />
            {empresa.aberto ? "Aberta" : "Fechada"}
          </span>
        </header>

        {/* Pedidos fica sempre montado: Realtime, alerta e impressão seguem rodando nas outras seções. */}
        <Pedidos equipe={{ empresa_id: empresa.id, nome: empresa.nome, formas, config, virada }} visivel={atual.id === "pedidos"} />

        {atual.id !== "pedidos" && (
          <main className={`mx-auto w-full p-4 md:p-8 ${largo ? "max-w-5xl" : "max-w-3xl"}`}>
            {/* No Cardápio o topo (capa + nome editável) já faz o papel de título. */}
            <h1 className={atual.id === "cardapio" ? "sr-only" : "mb-5 text-2xl font-bold"}>{atual.nome}</h1>
            {atual.id === "historico" && <Historico empresaId={empresa.id} empresaNome={empresa.nome} config={config} virada={virada} />}
            {atual.id === "caixas" && <Caixas empresaId={empresa.id} empresaNome={empresa.nome} formas={formas} config={config} />}
            {atual.id === "relatorios" && <Relatorios empresaId={empresa.id} virada={virada} />}
            {atual.id === "cardapio" && <EditorCardapio {...props} />}
            {atual.id === "mesas" && <Mesas empresaId={empresa.id} />}
            {atual.id === "entrega" && <Bairros empresaId={empresa.id} />}
            {atual.id === "whatsapp" && <WhatsApp empresa={empresa} />}
            {atual.id === "gerais" && <Gerais {...props} />}
            {atual.id === "pagamentos" && <Pagamentos {...props} />}
            {atual.id === "info" && <InfoNegocio {...props} />}
            {atual.id === "equipe" && <Equipe empresaId={empresa.id} />}
            {atual.id === "impressao" && <Impressao {...props} />}
          </main>
        )}
      </div>

      {menu && <Modal titulo={empresa.nome} fechar={() => setMenu(false)}>{menuLateral}</Modal>}
      {qr && <QrModal slug={empresa.slug} nome={empresa.nome} fechar={() => setQr(false)} />}
    </div>
  );
}

function MenuLateral({ empresa, papel, atual, permitido, ir, alternarLoja, abrirQr, sair }: {
  empresa: Empresa; papel: Papel; atual: string; permitido: (i: Item) => boolean; ir: (id: string) => void;
  alternarLoja: () => void; abrirQr: () => void; sair: () => void;
}) {
  // Grupos abertos: o da seção atual começa aberto.
  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(MENU.filter((x) => ehGrupo(x) && x.itens.some((i) => i.id === atual)).map((x) => (x as Grupo).grupo)),
  );
  const item = "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium";
  const neutro = "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800";
  const ativo = "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
  const botaoItem = (i: Item, recuo = false) => (
    <button key={i.id} onClick={() => ir(i.id)} aria-current={i.id === atual ? "page" : undefined}
      className={`${item} ${recuo ? "pl-9" : ""} ${i.id === atual ? ativo : neutro}`}>
      <i.Icone className="size-[18px] shrink-0" /> <span className="truncate text-left">{i.nome}</span>
    </button>
  );

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <div className="hidden items-center gap-3 px-1 lg:flex">
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-rose-600 font-bold text-white">
          {empresa.logo_url ? <img src={empresa.logo_url} alt="" className="size-full object-cover" /> : empresa.nome[0]}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-bold">{empresa.nome}</span>
          <span className="block text-xs text-neutral-500 capitalize">{papel}</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5" aria-label="Seções do painel">
        {MENU.map((x) => {
          if (!ehGrupo(x)) return permitido(x) ? botaoItem(x) : null;
          const visiveis = x.itens.filter(permitido);
          if (!visiveis.length) return null;
          const aberto = abertos.has(x.grupo);
          return (
            <div key={x.grupo}>
              <button aria-expanded={aberto}
                onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(x.grupo)) n.delete(x.grupo); else n.add(x.grupo); return n; })}
                className={`${item} ${neutro}`}>
                <x.Icone className="size-[18px] shrink-0" /> <span className="flex-1 text-left">{x.grupo}</span>
                <ChevronDown className={`size-4 transition-transform ${aberto ? "" : "-rotate-90"}`} />
              </button>
              {aberto && <div className="mt-0.5 flex flex-col gap-0.5">{visiveis.map((i) => botaoItem(i, true))}</div>}
            </div>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <button onClick={alternarLoja} role="switch" aria-checked={empresa.aberto}
          className={`flex h-14 w-full items-center justify-between rounded-xl px-4 font-bold text-white ${empresa.aberto ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
          <span>{empresa.aberto ? "Loja aberta" : "Loja fechada"}</span>
          <span className={`flex h-7 w-12 items-center rounded-full bg-white/30 p-1 ${empresa.aberto ? "justify-end" : "justify-start"}`}>
            <span className="size-5 rounded-full bg-white shadow" />
          </span>
        </button>
        <Link href={`/${empresa.slug}`} target="_blank" className={`${item} ${neutro}`}>
          <ExternalLink className="size-[18px]" /> Ver cardápio
        </Link>
        <button onClick={abrirQr} className={`${item} ${neutro}`}>
          <QrCode className="size-[18px]" /> QR Code e links
        </button>
        <button onClick={sair} className={`${item} ${neutro}`}>
          <LogOut className="size-[18px]" /> Sair
        </button>
      </div>
    </div>
  );
}

