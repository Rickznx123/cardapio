"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Armchair, BarChart3, Bike, ChevronDown, ClipboardList, CreditCard, ExternalLink, History, Info, LogOut, Menu, MessageCircle, Package, Printer, QrCode,
  Settings, SlidersHorizontal, TicketPercent, TrendingUp, Users, UtensilsCrossed, Wallet,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { situacaoPlano } from "@/lib/planos";
import { lerStatusLoja, textoProximaMudanca, type StatusLoja } from "@/lib/status-loja";
import { Bairros } from "./bairros";
import { EditorCardapio } from "./cardapio/editor";
import { Clientes } from "./clientes";
import { Gerais } from "./config/gerais";
import { Impressao } from "./config/impressao";
import { Pagamentos } from "./config/pagamentos";
import { type Empresa, InfoNegocio } from "./configuracoes";
import { Cupons } from "./cupons";
import { Equipe } from "./equipe";
import { Estoque } from "./estoque";
import { Mesas } from "./mesas";
import { Pedidos } from "./pedidos";
import { Assinar, Checklist, FaixaTrial, TesteEncerrado } from "./plano";
import { QrModal } from "./qr";
import { carregarSessao, type Papel, supabase } from "./ui";
import { Caixas } from "./vendas/caixas";
import { Historico } from "./vendas/historico";
import { Relatorios } from "./vendas/relatorios";
import { WhatsApp } from "./whatsapp";

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
  { id: "estoque", nome: "Estoque", Icone: Package, papeis: TODOS },
  { id: "mesas", nome: "Mesas", Icone: Armchair, papeis: DONO },
  { id: "entrega", nome: "Entrega", Icone: Bike, papeis: DONO },
  { id: "clientes", nome: "Clientes", Icone: Users, papeis: DONO },
  { id: "cupons", nome: "Cupons", Icone: TicketPercent, papeis: DONO },
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
  const [plano, setPlano] = useState<ReturnType<typeof situacaoPlano> | null>(null);
  const [assinar, setAssinar] = useState(false);
  const [statusLoja, setStatusLoja] = useState<StatusLoja | null>(null);
  const [erroStatusLoja, setErroStatusLoja] = useState("");
  const empresaId = empresa?.id;
  const horariosEmpresa = JSON.stringify(empresa?.horarios ?? null);

  useEffect(() => {
    carregarSessao().then((s) => {
      if (!s) return router.replace("/login");
      setPapel(s.papel);
      setEmpresa(s.empresa);
      if (s.empresa) setPlano(situacaoPlano(s.empresa, Date.now()));
    });
  }, [router]);

  useEffect(() => {
    if (!empresaId) return;
    let ativo = true;
    let erroNotificado = false;
    async function atualizarStatus() {
      const { data, error } = await supabase.rpc("status_loja", { p_empresa_id: empresaId });
      if (!ativo) return;
      if (error) {
        if (!erroNotificado) {
          erroNotificado = true;
          console.error("Falha ao consultar status da loja:", error);
        }
        setErroStatusLoja("Não foi possível atualizar o status de funcionamento da loja.");
        return;
      }
      try {
        setStatusLoja(lerStatusLoja(data));
        setErroStatusLoja("");
        erroNotificado = false;
      } catch (erro) {
        if (!erroNotificado) {
          erroNotificado = true;
          console.error("Falha ao interpretar status da loja:", erro);
        }
        setErroStatusLoja("O status de funcionamento recebido é inválido.");
      }
    }
    void atualizarStatus();
    const timer = window.setInterval(() => void atualizarStatus(), 60_000);
    return () => { ativo = false; window.clearInterval(timer); };
  }, [empresaId, horariosEmpresa]);

  function ir(id: string) {
    setSecao(id);
    setMenu(false);
    history.replaceState(null, "", id === "pedidos" ? "/painel" : `/painel?secao=${id}`);
  }

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
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

  if (plano && !plano.liberada) return <TesteEncerrado empresa={empresa} sair={sair} />;

  const permitido = (i: Item) => i.papeis.includes(papel);
  const atual = ITENS.find((i) => i.id === secao && permitido(i)) ?? ITENS[0];
  const menuLateral = (
    <MenuLateral empresa={empresa} papel={papel} atual={atual.id} permitido={permitido} ir={ir}
      statusLoja={statusLoja} erroStatusLoja={erroStatusLoja}
      abrirQr={() => { setMenu(false); setQr(true); }} sair={sair} />
  );
  const largo = ["cardapio", "estoque", "historico", "relatorios", "impressao", "whatsapp", "clientes", "cupons"].includes(atual.id);
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
          <span role="status" className={`mr-2 flex items-center gap-1.5 text-xs font-semibold ${
            statusLoja?.aberto ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-600 dark:text-neutral-400"}`}>
            <span className={`size-2.5 rounded-full ${statusLoja?.aberto ? "bg-emerald-500" : "bg-neutral-400"}`} />
            {erroStatusLoja ? "Status indisponível" : statusLoja ? `Loja ${statusLoja.aberto ? "aberta" : "fechada"}` : "Consultando loja…"}
          </span>
        </header>

        {plano?.trial && <FaixaTrial dias={plano.diasRestantes ?? 0} assinar={() => setAssinar(true)} />}
        {erroStatusLoja && (
          <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {erroStatusLoja} A criação de pedidos pelo cardápio depende da confirmação do horário no servidor.
          </p>
        )}
        {statusLoja && !statusLoja.horarios_configurados && (
          <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Configure os horários em <strong>Configurações → Gerais</strong> para calcular automaticamente quando a loja fecha. Até lá, consideramos a loja aberta para não bloquear pedidos.
          </p>
        )}
        {papel === "dono" && <Checklist empresa={empresa} />}

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
            {atual.id === "estoque" && <Estoque empresaId={empresa.id} podeAlterar={papel === "dono"} />}
            {atual.id === "mesas" && <Mesas empresaId={empresa.id} />}
            {atual.id === "entrega" && <Bairros empresaId={empresa.id} />}
            {atual.id === "clientes" && <Clientes empresaId={empresa.id} empresaNome={empresa.nome} />}
            {atual.id === "cupons" && <Cupons empresaId={empresa.id} />}
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
      {assinar && <Assinar empresa={empresa} fechar={() => setAssinar(false)} />}
      {qr && <QrModal slug={empresa.slug} nome={empresa.nome} fechar={() => setQr(false)} />}
    </div>
  );
}

function MenuLateral({ empresa, papel, atual, permitido, ir, statusLoja, erroStatusLoja, abrirQr, sair }: {
  empresa: Empresa; papel: Papel; atual: string; permitido: (i: Item) => boolean; ir: (id: string) => void;
  statusLoja: StatusLoja | null; erroStatusLoja: string; abrirQr: () => void; sair: () => void;
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
        <div role="status" className={`rounded-xl px-4 py-3 ${
          statusLoja?.aberto && !erroStatusLoja ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
            : "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"}`}>
          <div className="flex items-center gap-2 font-bold">
            <span className={`size-2.5 shrink-0 rounded-full ${statusLoja?.aberto && !erroStatusLoja ? "bg-emerald-500" : "bg-neutral-400"}`} />
            {erroStatusLoja ? "Status da loja indisponível" : statusLoja ? `Loja ${statusLoja.aberto ? "aberta" : "fechada"}` : "Consultando status da loja…"}
          </div>
          {statusLoja && !erroStatusLoja && (
            <p className="mt-1 pl-[18px] text-xs">
              {textoProximaMudanca(statusLoja) || (statusLoja.horarios_configurados
                ? "Sem horário de fechamento definido"
                : "Configure os horários para calcular o status")}
            </p>
          )}
          {erroStatusLoja && <p className="mt-1 pl-[18px] text-xs">{erroStatusLoja}</p>}
        </div>
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
