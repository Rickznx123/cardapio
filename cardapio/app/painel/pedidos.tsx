"use client";

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Ban, CheckCheck, Clock, Eye, MessageCircle, MoreVertical, Plus, Printer, Search, VolumeX, Wallet, Wifi, WifiOff,
} from "lucide-react";
import { Modal } from "@/components/modal";
import { EscolhaPagamento } from "@/components/pagamento";
import { toast } from "@/components/toast";
import { useArmazenado } from "@/lib/armazenado";
import { cupomPedido, ORIGEM, type PedidoBalcao, SELECT_PEDIDO } from "@/lib/cupom";
import { imprimir } from "@/lib/impressao";
import { createClient } from "@/lib/supabase/client";
import { linkWhatsApp } from "@/lib/telefone";
import { brl, FORMAS, type FormaPagamento, type StatusPedido } from "@/lib/tipos";
import { Comandas } from "./comandas";
import { NovoPedido } from "./novo-pedido";

const supabase = createClient();

export type Equipe = { empresa_id: string; nome: string };
type Aba = "retirada" | "entrega" | "mesa";
type Filtro = "tudo" | "novo" | "preparo" | "pronto";

const ABAS: [Aba, string][] = [["retirada", "Balcão"], ["entrega", "Delivery"], ["mesa", "Mesas"]];
const FILTROS: [Filtro, string][] = [["tudo", "Tudo"], ["novo", "Novo"], ["preparo", "Em preparo"], ["pronto", "Pronto"]];
const ATIVOS: StatusPedido[] = ["novo", "preparo", "pronto"];
const ROTULO_STATUS: Record<StatusPedido, string> = {
  novo: "Novo", preparo: "Em preparo", pronto: "Pronto", entregue: "Entregue", cancelado: "Cancelado",
};
const COR_STATUS: Record<StatusPedido, string> = {
  novo: "bg-rose-600 text-white",
  preparo: "bg-amber-400 text-black",
  pronto: "bg-emerald-600 text-white",
  entregue: "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200",
  cancelado: "bg-neutral-200 text-neutral-500",
};
const COR_ORIGEM: Record<PedidoBalcao["origem"], string> = {
  web: "border-sky-600 text-sky-700 dark:text-sky-300",
  garcom: "border-violet-600 text-violet-700 dark:text-violet-300",
  balcao: "border-amber-600 text-amber-700 dark:text-amber-300",
};

// Som de alerta sem arquivo. O navegador só libera áudio após um toque na página.
let audio: AudioContext | null = null;
function bip() {
  try {
    audio ??= new AudioContext();
    [0, 0.3].forEach((t) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.3;
      o.connect(g).connect(audio!.destination);
      o.start(audio!.currentTime + t);
      o.stop(audio!.currentTime + t + 0.18);
    });
  } catch {}
}

// Relógio que avança a cada 30s (fora do render: cacheComponents proíbe Date.now() no prerender).
let agoraAtual = 0;
function assinarRelogio(avisar: () => void) {
  agoraAtual = Date.now();
  const t = setInterval(() => { agoraAtual = Date.now(); avisar(); }, 30_000);
  return () => clearInterval(t);
}
const useAgora = () => useSyncExternalStore(assinarRelogio, () => agoraAtual, () => 0);

const buscarPedido = async (id: string) =>
  (await supabase.from("pedidos").select(SELECT_PEDIDO).eq("id", id).maybeSingle()).data as PedidoBalcao | null;
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const inicioDoDia = (agora: number) => { const d = new Date(agora); d.setHours(0, 0, 0, 0); return d; };

export function Pedidos({ equipe, visivel }: { equipe: Equipe; visivel: boolean }) {
  const [pedidos, setPedidos] = useState<PedidoBalcao[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [online, setOnline] = useState(false);
  const [aba, setAba] = useState<Aba>("retirada");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [busca, setBusca] = useState("");
  const [versaoMesas, setVersaoMesas] = useState(0);
  const [somLiberado, setSomLiberado] = useState(false);
  const [novo, setNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<PedidoBalcao | null>(null);
  const [pagando, setPagando] = useState<PedidoBalcao | null>(null);
  const [auto, setAuto] = useArmazenado("balcao:impressao-automatica", true);
  const agora = useAgora();

  // Reivindica a impressão no banco: só a aba que conseguir setar impresso_em imprime (evita cupom duplicado).
  async function imprimirSeNinguem(p: PedidoBalcao) {
    const quando = new Date().toISOString();
    const { data } = await supabase.from("pedidos").update({ impresso_em: quando })
      .eq("id", p.id).is("impresso_em", null).select("id");
    if (!data?.length) return;
    imprimir(cupomPedido(equipe.nome, p));
    guardar({ ...p, impresso_em: quando });
  }

  function guardar(p: PedidoBalcao) {
    setPedidos((lista) =>
      p.status === "cancelado" ? lista.filter((x) => x.id !== p.id) : [...lista.filter((x) => x.id !== p.id), p],
    );
  }

  const receber = useEffectEvent((p: PedidoBalcao, chegou: boolean) => {
    guardar(p);
    if (p.comanda_id) setVersaoMesas((v) => v + 1);
    if (chegou) toast.ok(`Novo pedido #${p.numero}`);
    if (auto && p.status === "novo" && !p.impresso_em) imprimirSeNinguem(p);
  });

  // Refaz o fetch completo (ao conectar e a cada reconexão) para não perder nada que chegou offline.
  const recarregar = useEffectEvent(async () => {
    const desde = inicioDoDia(Date.now()).toISOString();
    const { data, error } = await supabase.from("pedidos").select(SELECT_PEDIDO)
      .eq("empresa_id", equipe.empresa_id).neq("status", "cancelado")
      .or(`status.in.(novo,preparo,pronto),created_at.gte.${desde}`)
      .order("created_at");
    if (error) return toast.erro(error.message);
    const lista = data as unknown as PedidoBalcao[];
    setPedidos(lista);
    setCarregado(true);
    setVersaoMesas((v) => v + 1);
    if (auto) lista.filter((p) => p.status === "novo" && !p.impresso_em).forEach(imprimirSeNinguem);
  });

  const empresaId = equipe.empresa_id;
  useEffect(() => {
    let vivo = true;
    let canal: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout>;

    const conectar = () => {
      const c = supabase
        .channel(`painel-${empresaId}-${Date.now()}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` },
          (payload) => {
            const id = (payload.new as { id?: string }).id;
            if (!id) return;
            const chegou = payload.eventType === "INSERT";
            if (chegou) bip();
            // Não usa o payload: no INSERT o pedido ainda está com total 0 e sem itens.
            buscarPedido(id).then((p) => p && receber(p, chegou));
          })
        .subscribe((status) => {
          if (!vivo || canal !== c) return;
          if (status === "SUBSCRIBED") {
            setOnline(true);
            recarregar();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setOnline(false);
            canal = null;
            supabase.removeChannel(c);
            clearTimeout(retry);
            retry = setTimeout(conectar, 3000);
          }
        });
      canal = c;
    };
    conectar();

    return () => {
      vivo = false;
      clearTimeout(retry);
      if (canal) supabase.removeChannel(canal);
    };
  }, [empresaId]);

  async function mudarStatus(p: PedidoBalcao, status: StatusPedido) {
    if (status === "entregue" && !p.pago && !confirm(`O pedido #${p.numero} não está pago. Finalizar mesmo assim?`)) return;
    const { error } = await supabase.from("pedidos").update({ status }).eq("id", p.id);
    if (error) return toast.erro(error.message);
    guardar({ ...p, status });
  }

  async function cancelar(p: PedidoBalcao) {
    if (!confirm(`Cancelar o pedido #${p.numero}?`)) return;
    const { error } = await supabase.rpc("cancelar_pedido", { p_id: p.id });
    if (error) return toast.erro(error.message);
    guardar({ ...p, status: "cancelado" });
    if (p.comanda_id) setVersaoMesas((v) => v + 1);
    toast.ok(`Pedido #${p.numero} cancelado`);
  }

  async function finalizarProntos(lista: PedidoBalcao[]) {
    const naoPagos = lista.filter((p) => !p.pago).length;
    const msg = naoPagos
      ? `Finalizar ${lista.length} pedido(s)? ${naoPagos} não está(ão) pago(s).`
      : `Finalizar ${lista.length} pedido(s) pronto(s)?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from("pedidos").update({ status: "entregue" }).in("id", lista.map((p) => p.id));
    if (error) return toast.erro(error.message);
    lista.forEach((p) => guardar({ ...p, status: "entregue" }));
    toast.ok(`${lista.length} pedido(s) finalizado(s)`);
  }

  const hoje = inicioDoDia(agora).getTime();
  const totalDia = pedidos.filter((p) => Date.parse(p.created_at) >= hoje).reduce((s, p) => s + Number(p.total), 0);
  const ativosPor = (t: Aba) => pedidos.filter((p) => p.tipo === t && ATIVOS.includes(p.status)).length;
  const termo = normalizar(busca.trim().replace(/^#/, ""));
  const lista = pedidos
    .filter((p) => p.tipo === aba)
    .filter((p) => filtro === "tudo" || p.status === filtro)
    .filter((p) => !termo || String(p.numero) === termo || normalizar(p.cliente_nome ?? "").includes(termo))
    // Fila: ativos do mais antigo pro mais novo; entregues no fim, mais recentes primeiro.
    .sort((a, b) => {
      const ea = a.status === "entregue" ? 1 : 0;
      const eb = b.status === "entregue" ? 1 : 0;
      if (ea !== eb) return ea - eb;
      return ea ? b.created_at.localeCompare(a.created_at) : a.created_at.localeCompare(b.created_at);
    });
  const prontos = pedidos.filter((p) => p.tipo === aba && p.status === "pronto");

  return (
    <section hidden={!visivel} className="flex min-h-full flex-col"
      onPointerDown={() => { if (!somLiberado) { audio ??= new AudioContext(); audio.resume(); setSomLiberado(true); } }}>
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:px-6 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mr-auto">
          <h1 className="text-xl font-bold">Pedidos</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Hoje: <b className="text-neutral-900 dark:text-white">{brl(totalDia)}</b></p>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
          online ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "animate-pulse bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>
          {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />} {online ? "Ao vivo" : "Reconectando…"}
        </span>
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-300 px-3 py-1 text-sm font-medium dark:border-neutral-700">
          <Printer className="size-4" /> Impressão automática
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-rose-600" />
        </label>
        <label className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nº ou cliente"
            aria-label="Buscar pedido"
            className="h-10 w-full rounded-lg border border-neutral-300 bg-transparent pr-3 pl-9 text-sm dark:border-neutral-700" />
        </label>
        <button onClick={() => setNovo(true)}
          className="flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 font-semibold text-white hover:bg-rose-700">
          <Plus className="size-5" /> Novo pedido
        </button>
        {!somLiberado && (
          <span className="flex w-full items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900">
            <VolumeX className="size-4" /> Toque na tela para ativar o som de novos pedidos
          </span>
        )}
      </header>

      <div className="space-y-3 px-4 pt-4 lg:px-6">
        <div className="flex gap-1 rounded-xl bg-neutral-200/70 p-1 dark:bg-neutral-800" role="tablist">
          {ABAS.map(([a, rotulo]) => (
            <button key={a} role="tab" aria-selected={a === aba} onClick={() => setAba(a)}
              className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${
                a === aba ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-600 dark:text-neutral-400"}`}>
              {rotulo}
              <span className={`rounded-full px-2 text-xs ${ativosPor(a) ? "bg-rose-600 text-white" : "bg-neutral-300 dark:bg-neutral-700"}`}>{ativosPor(a)}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {FILTROS.map(([f, rotulo]) => (
            <button key={f} onClick={() => setFiltro(f)} aria-pressed={f === filtro}
              className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium ${
                f === filtro ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "border border-neutral-300 dark:border-neutral-700"}`}>
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4 lg:px-6">
        {aba === "mesa" && <Comandas empresaId={equipe.empresa_id} empresaNome={equipe.nome} versao={versaoMesas} />}

        {!carregado ? (
          <div className="space-y-2">{[0, 1, 2].map((n) => <div key={n} className="h-24 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />)}</div>
        ) : lista.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">
            {termo ? "Nenhum pedido encontrado." : "Nenhum pedido aqui por enquanto."}
          </p>
        ) : (
          <ul className="space-y-2">
            {lista.map((p) => (
              <LinhaPedido key={p.id} p={p} agora={agora} mudarStatus={mudarStatus} cancelar={cancelar}
                detalhes={() => setDetalhe(p)} pagar={() => setPagando(p)}
                reimprimir={() => { imprimir(cupomPedido(equipe.nome, p)); toast.ok(`Imprimindo #${p.numero}`); }} />
            ))}
          </ul>
        )}
      </div>

      {prontos.length > 0 && (
        <footer className="sticky bottom-0 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur lg:px-6 dark:border-neutral-800 dark:bg-neutral-900/95">
          <button onClick={() => finalizarProntos(prontos)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-700 sm:w-auto sm:px-5">
            <CheckCheck className="size-5" /> Finalizar todos os prontos ({prontos.length})
          </button>
        </footer>
      )}

      {novo && <NovoPedido empresaId={equipe.empresa_id} fechar={() => setNovo(false)} />}
      {detalhe && <DetalhesModal p={pedidos.find((x) => x.id === detalhe.id) ?? detalhe} fechar={() => setDetalhe(null)} />}
      {pagando && (
        <PagarModal p={pagando} fechar={() => setPagando(null)}
          salvo={(campos) => { guardar({ ...pagando, ...campos }); setPagando(null); }} />
      )}
    </section>
  );
}

function Decorrido({ desde, agora }: { desde: string; agora: number }) {
  const min = Math.max(0, Math.floor((agora - Date.parse(desde)) / 60_000));
  const cls = min > 30 ? "bg-red-600 text-white" : min > 15 ? "bg-orange-500 text-black" : "bg-neutral-200 dark:bg-neutral-700";
  const texto = min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ${cls}`}>
      <Clock className="size-3.5" /> {texto}
    </span>
  );
}

const acao = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800";

function LinhaPedido({ p, agora, mudarStatus, cancelar, detalhes, pagar, reimprimir }: {
  p: PedidoBalcao; agora: number; mudarStatus: (p: PedidoBalcao, s: StatusPedido) => void;
  cancelar: (p: PedidoBalcao) => void; detalhes: () => void; pagar: () => void; reimprimir: () => void;
}) {
  const tipo = p.tipo === "mesa" ? `Mesa ${p.comandas?.mesas?.numero ?? "?"}` : p.tipo === "entrega" ? "Delivery" : "Balcão";
  const wa = linkWhatsApp(p.cliente_telefone);
  const ativo = ATIVOS.includes(p.status);
  const qtdItens = p.pedido_itens.reduce((s, i) => s + i.quantidade, 0);
  return (
    <li className={`grid grid-cols-2 items-center gap-x-3 gap-y-3 rounded-xl border bg-white p-3 shadow-sm lg:grid-cols-[6.5rem_8.5rem_8rem_10.5rem_minmax(0,1fr)_auto] lg:gap-y-0 dark:bg-neutral-900 ${
      p.status === "novo" ? "border-rose-300 dark:border-rose-900" : "border-neutral-200 dark:border-neutral-800"}`}>
      <div>
        <p className="text-2xl leading-none font-black tabular-nums">#{p.numero}</p>
        <p className="mt-1 text-sm font-medium text-neutral-600 dark:text-neutral-400">{tipo}</p>
      </div>
      <div className="justify-self-end lg:justify-self-start">
        {ativo ? <Decorrido desde={p.created_at} agora={agora} /> : <span className="text-sm text-neutral-500">Finalizado</span>}
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {new Date(p.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${COR_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
        <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${COR_ORIGEM[p.origem]}`}>{ORIGEM[p.origem]}</span>
      </div>
      <div className="justify-self-end text-right lg:justify-self-start lg:text-left">
        <p className="text-lg font-bold tabular-nums">{brl(p.total)}</p>
        <p className="flex flex-wrap items-center justify-end gap-1 text-xs lg:justify-start">
          <span className={`rounded px-1.5 py-0.5 font-bold ${p.pago ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>
            {p.pago ? "Pago" : "Não pago"}
          </span>
          {p.forma_pagamento && <span className="text-neutral-600 dark:text-neutral-400">{FORMAS[p.forma_pagamento]}</span>}
        </p>
        {p.troco_para != null && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Troco para {brl(p.troco_para)}</p>}
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-2 lg:col-span-1">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{p.cliente_nome ?? p.membros?.nome ?? "—"}</p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {qtdItens} {qtdItens === 1 ? "item" : "itens"}{p.bairro_nome ? ` · ${p.bairro_nome}` : ""}
          </p>
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${p.cliente_nome ?? "cliente"}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
            <MessageCircle className="size-5" />
          </a>
        )}
        <button onClick={detalhes} aria-label={`Detalhes do pedido ${p.numero}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800">
          <Eye className="size-5" />
        </button>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1 lg:justify-end">
        <button onClick={reimprimir} aria-label={`Imprimir pedido ${p.numero}`} className={acao}><Printer className="size-4" /></button>
        <select value={p.status} onChange={(e) => mudarStatus(p, e.target.value as StatusPedido)} aria-label="Status"
          className="h-9 rounded-lg border border-neutral-300 bg-transparent px-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-900">
          {(["novo", "preparo", "pronto", "entregue"] as const).map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
        </select>
        {!p.pago && p.tipo !== "mesa" && (
          <button onClick={pagar} className={acao}><Wallet className="size-4" /> Pagar</button>
        )}
        {ativo && (
          <button onClick={() => mudarStatus(p, "entregue")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
            Finalizar
          </button>
        )}
        <details className="relative">
          <summary aria-label="Mais ações" className={`${acao} list-none px-2 [&::-webkit-details-marker]:hidden`}>
            <MoreVertical className="size-4" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {p.pago && p.tipo !== "mesa" && (
              <button onClick={(e) => { e.currentTarget.closest("details")!.open = false; pagar(); }}
                className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <Wallet className="size-4" /> Pagamento
              </button>
            )}
            <button onClick={(e) => { e.currentTarget.closest("details")!.open = false; cancelar(p); }}
              className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
              <Ban className="size-4" /> Cancelar pedido
            </button>
          </div>
        </details>
      </div>
    </li>
  );
}

function DetalhesModal({ p, fechar }: { p: PedidoBalcao; fechar: () => void }) {
  const linha = "flex justify-between gap-3 py-1";
  return (
    <Modal titulo={`Pedido #${p.numero}`} fechar={fechar}>
      <div className="space-y-4 p-5">
        <ul className="space-y-2">
          {p.pedido_itens.map((i, n) => (
            <li key={n}>
              <div className={linha}><span><b>{i.quantidade}x</b> {i.nome}</span><span>{brl(i.preco * i.quantidade)}</span></div>
              {i.observacao && <p className="rounded bg-yellow-100 px-2 py-0.5 text-sm font-semibold text-yellow-900">» {i.observacao}</p>}
            </li>
          ))}
        </ul>
        {p.observacao && <p className="rounded-lg bg-yellow-100 p-3 font-semibold text-yellow-900">Obs: {p.observacao}</p>}
        <dl className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
          <div className={linha}><dt>Subtotal</dt><dd>{brl(p.subtotal)}</dd></div>
          {p.tipo === "entrega" && <div className={linha}><dt>Taxa de entrega</dt><dd>{brl(p.taxa_entrega)}</dd></div>}
          <div className={`${linha} text-base font-bold`}><dt>Total</dt><dd>{brl(p.total)}</dd></div>
          <div className={linha}><dt>Pagamento</dt><dd>{p.forma_pagamento ? FORMAS[p.forma_pagamento] : "A definir"} · {p.pago ? "Pago" : "Não pago"}</dd></div>
          {p.troco_para != null && <div className={linha}><dt>Troco</dt><dd>para {brl(p.troco_para)} (levar {brl(p.troco_para - p.total)})</dd></div>}
          {p.cliente_nome && <div className={linha}><dt>Cliente</dt><dd>{p.cliente_nome}</dd></div>}
          {p.cliente_telefone && <div className={linha}><dt>Telefone</dt><dd>{p.cliente_telefone}</dd></div>}
          {p.tipo === "entrega" && <div className={linha}><dt>Endereço</dt><dd className="text-right">{p.endereco} — {p.bairro_nome}</dd></div>}
          {p.membros && <div className={linha}><dt>Garçom</dt><dd>{p.membros.nome}</dd></div>}
          <div className={linha}><dt>Origem</dt><dd>{ORIGEM[p.origem]}</dd></div>
          <div className={linha}><dt>Impresso</dt><dd>{p.impresso_em ? new Date(p.impresso_em).toLocaleTimeString("pt-BR", { timeStyle: "short" }) : "não"}</dd></div>
        </dl>
      </div>
    </Modal>
  );
}

function PagarModal({ p, fechar, salvo }: {
  p: PedidoBalcao; fechar: () => void; salvo: (campos: Partial<PedidoBalcao>) => void;
}) {
  const [forma, setForma] = useState<FormaPagamento | null>(p.forma_pagamento);
  const [recebido, setRecebido] = useState("");
  const [salvando, setSalvando] = useState(false);
  const valorRecebido = Number(recebido.replace(",", ".")) || 0;

  async function salvar(campos: Partial<PedidoBalcao>) {
    setSalvando(true);
    const { error } = await supabase.from("pedidos").update(campos).eq("id", p.id);
    setSalvando(false);
    if (error) return toast.erro(error.message);
    toast.ok(campos.pago ? `Pedido #${p.numero} pago` : "Pagamento desfeito");
    salvo(campos);
  }

  return (
    <Modal titulo={`Pagamento · #${p.numero}`} fechar={fechar}
      rodape={p.pago ? (
        <button disabled={salvando} onClick={() => salvar({ pago: false, pago_em: null })}
          className="h-12 w-full rounded-lg border border-red-300 font-semibold text-red-600 disabled:opacity-50">
          Desfazer pagamento
        </button>
      ) : (
        <button disabled={!forma || salvando} onClick={() => salvar({ pago: true, pago_em: new Date().toISOString(), forma_pagamento: forma })}
          className="h-12 w-full rounded-lg bg-emerald-600 font-semibold text-white disabled:opacity-50">
          Confirmar pagamento de {brl(p.total)}
        </button>
      )}>
      <div className="space-y-4 p-5">
        <p className="text-center text-3xl font-bold tabular-nums">{brl(p.total)}</p>
        {p.pago ? (
          <p className="text-center text-neutral-600 dark:text-neutral-300">
            Pago {p.forma_pagamento && `em ${FORMAS[p.forma_pagamento]}`}
            {p.pago_em && ` às ${new Date(p.pago_em).toLocaleTimeString("pt-BR", { timeStyle: "short" })}`}.
          </p>
        ) : (
          <>
            <EscolhaPagamento valor={forma} mudar={setForma} />
            {forma === "dinheiro" && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Valor recebido (para calcular o troco)</span>
                <input value={recebido} onChange={(e) => setRecebido(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal"
                  placeholder={p.troco_para != null ? String(p.troco_para).replace(".", ",") : "0,00"}
                  className="h-12 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700" />
                {valorRecebido >= p.total && (
                  <span className="mt-2 block text-lg font-bold text-emerald-700 dark:text-emerald-400">Troco: {brl(valorRecebido - p.total)}</span>
                )}
              </label>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
