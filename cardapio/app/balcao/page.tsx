"use client";

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Armchair, Ban, Bike, ClipboardList, Clock, LayoutDashboard, Printer, Settings, Store, VolumeX, Wifi, WifiOff,
} from "lucide-react";
import { toast } from "@/components/toast";
import { useArmazenado } from "@/lib/armazenado";
import { cupomPedido, type PedidoBalcao, SELECT_PEDIDO } from "@/lib/cupom";
import { imprimir } from "@/lib/impressao";
import { createClient } from "@/lib/supabase/client";
import { brl, STATUS, type StatusPedido } from "@/lib/tipos";
import { Mesas } from "./mesas";

const supabase = createClient();
const COLUNAS = ["novo", "preparo", "pronto", "entregue"] as const;
const PROXIMO: Partial<Record<StatusPedido, [StatusPedido, string]>> = {
  novo: ["preparo", "Iniciar preparo"], preparo: ["pronto", "Pronto"], pronto: ["entregue", "Entregue"],
};

type Equipe = { empresa_id: string; papel: "dono" | "caixa"; nome: string };

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

const buscarPedido = async (id: string) =>
  (await supabase.from("pedidos").select(SELECT_PEDIDO).eq("id", id).maybeSingle()).data as PedidoBalcao | null;

export default function Balcao() {
  const router = useRouter();
  const [equipe, setEquipe] = useState<Equipe | null>();
  const [pedidos, setPedidos] = useState<PedidoBalcao[]>([]);
  const [online, setOnline] = useState(false);
  const [aba, setAba] = useState<"pedidos" | "mesas">("pedidos");
  const [versaoMesas, setVersaoMesas] = useState(0);
  const [somLiberado, setSomLiberado] = useState(false);
  const [auto, setAuto] = useArmazenado("balcao:impressao-automatica", true);
  const agora = useAgora();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.replace("/login");
      const { data } = await supabase
        .from("membros")
        .select("empresa_id, papel, empresas(nome)")
        .eq("user_id", user.id)
        .in("papel", ["dono", "caixa"])
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();
      setEquipe(data ? { empresa_id: data.empresa_id, papel: data.papel, nome: (data.empresas as unknown as { nome: string }).nome } : null);
    })();
  }, [router]);

  // Reivindica a impressão no banco: só a aba que conseguir setar impresso_em imprime (evita cupom duplicado).
  async function imprimirSeNinguem(p: PedidoBalcao) {
    const agora = new Date().toISOString();
    const { data } = await supabase.from("pedidos").update({ impresso_em: agora })
      .eq("id", p.id).is("impresso_em", null).select("id");
    if (!data?.length) return;
    imprimir(cupomPedido(equipe!.nome, p));
    guardar({ ...p, impresso_em: agora });
  }

  function guardar(p: PedidoBalcao) {
    setPedidos((lista) =>
      p.status === "cancelado" ? lista.filter((x) => x.id !== p.id) : [...lista.filter((x) => x.id !== p.id), p],
    );
  }

  const receber = useEffectEvent((p: PedidoBalcao) => {
    guardar(p);
    if (p.comanda_id) setVersaoMesas((v) => v + 1);
    if (auto && p.status === "novo" && !p.impresso_em) imprimirSeNinguem(p);
  });

  // Refaz o fetch completo (ao conectar e a cada reconexão) para não perder nada que chegou offline.
  const recarregar = useEffectEvent(async () => {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { data, error } = await supabase.from("pedidos").select(SELECT_PEDIDO)
      .eq("empresa_id", equipe!.empresa_id).neq("status", "cancelado")
      .or(`status.in.(novo,preparo,pronto),created_at.gte.${desde}`)
      .order("created_at");
    if (error) return;
    const lista = data as unknown as PedidoBalcao[];
    setPedidos(lista);
    setVersaoMesas((v) => v + 1);
    if (auto) lista.filter((p) => p.status === "novo" && !p.impresso_em).forEach(imprimirSeNinguem);
  });

  const empresaId = equipe?.empresa_id;
  useEffect(() => {
    if (!empresaId) return;
    let vivo = true;
    let canal: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout>;

    const conectar = () => {
      const c = supabase
        .channel(`balcao-${empresaId}-${Date.now()}`)
        .on("postgres_changes",
          { event: "*", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` },
          (payload) => {
            const id = (payload.new as { id?: string }).id;
            if (!id) return;
            if (payload.eventType === "INSERT") bip();
            // Não usa o payload: no INSERT o pedido ainda está com total 0 e sem itens.
            buscarPedido(id).then((p) => p && receber(p));
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


  async function avancar(p: PedidoBalcao, status: StatusPedido) {
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

  if (equipe === undefined) return <p className="p-6 text-xl">Carregando…</p>;
  if (equipe === null) return <p className="p-6 text-xl">Acesso só para dono ou caixa.</p>;

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 p-3"
      onPointerDown={() => { if (!somLiberado) { audio ??= new AudioContext(); audio.resume(); setSomLiberado(true); } }}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-bold">{equipe.nome}</h1>
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
          online ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "animate-pulse bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>
          {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          {online ? "Ao vivo" : "Reconectando…"}
        </span>
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-300 px-3 py-1 text-sm font-medium dark:border-neutral-700">
          <Printer className="size-4" />
          Impressão automática
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-rose-600" />
        </label>
        {!somLiberado && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
            <VolumeX className="size-4" /> Toque na tela para ativar o som
          </span>
        )}
        <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
          <Link href="/balcao/configurar" className="flex h-10 items-center gap-1.5 rounded-lg px-3 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <Settings className="size-4" /> Configurar impressão
          </Link>
          {equipe.papel === "dono" && (
            <Link href="/admin" className="flex h-10 items-center gap-1.5 rounded-lg px-3 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <LayoutDashboard className="size-4" /> Admin
            </Link>
          )}
        </nav>
      </header>

      <div className="flex gap-2" role="tablist">
        {([["pedidos", "Pedidos", ClipboardList], ["mesas", "Mesas", Armchair]] as const).map(([a, rotulo, Icone]) => (
          <button key={a} role="tab" aria-selected={a === aba} onClick={() => setAba(a)}
            className={`flex h-11 items-center gap-2 rounded-full px-5 font-semibold ${
              a === aba ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 dark:bg-neutral-800"}`}>
            <Icone className="size-5" /> {rotulo}
          </button>
        ))}
      </div>

      {aba === "mesas" ? (
        <Mesas empresaId={equipe.empresa_id} empresaNome={equipe.nome} versao={versaoMesas} />
      ) : (
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4">
          {COLUNAS.map((col) => {
            const daColuna = pedidos.filter((p) => p.status === col).sort((a, b) => a.created_at.localeCompare(b.created_at));
            // Entregues: mais recentes primeiro; demais: mais antigos primeiro (fila).
            const ordenados = col === "entregue" ? daColuna.reverse().slice(0, 30) : daColuna;
            return (
              <section key={col} aria-label={STATUS[col]}
                className={`flex w-[85vw] shrink-0 flex-col rounded-2xl border-t-8 bg-neutral-100 p-2 sm:w-96 lg:w-auto dark:bg-neutral-900 ${COR_COLUNA[col]}`}>
                <h2 className="mb-2 flex items-center justify-between px-1 text-lg font-bold uppercase tracking-wide">
                  {STATUS[col]}
                  <span className="rounded-full bg-white px-2.5 text-base dark:bg-neutral-800">{daColuna.length}</span>
                </h2>
                <ul className="space-y-2">
                  {ordenados.map((p) => (
                    <Cartao key={p.id} p={p} agora={agora} avancar={avancar} cancelar={cancelar}
                      reimprimir={() => { imprimir(cupomPedido(equipe.nome, p)); toast.ok(`Reimprimindo #${p.numero}`); }} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

const COR_COLUNA: Record<(typeof COLUNAS)[number], string> = {
  novo: "border-rose-600", preparo: "border-amber-500", pronto: "border-emerald-600", entregue: "border-neutral-400",
};
const TIPO: Record<PedidoBalcao["tipo"], { rotulo: string; cls: string; Icone: typeof Bike }> = {
  mesa: { rotulo: "MESA", cls: "bg-sky-700 text-white", Icone: Armchair },
  entrega: { rotulo: "ENTREGA", cls: "bg-violet-700 text-white", Icone: Bike },
  retirada: { rotulo: "RETIRADA", cls: "bg-amber-400 text-black", Icone: Store },
};

// Relógio que avança a cada 30s para o "tempo desde o pedido". Fora do render (cacheComponents proíbe Date.now() no prerender).
let agoraAtual = 0;
function assinarRelogio(avisar: () => void) {
  agoraAtual = Date.now();
  const t = setInterval(() => { agoraAtual = Date.now(); avisar(); }, 30_000);
  return () => clearInterval(t);
}
const useAgora = () => useSyncExternalStore(assinarRelogio, () => agoraAtual, () => 0);

function Decorrido({ desde, agora }: { desde: string; agora: number }) {
  const min = Math.max(0, Math.floor((agora - Date.parse(desde)) / 60_000));
  const cls = min > 30 ? "bg-red-600 text-white" : min > 15 ? "bg-orange-500 text-black" : "bg-neutral-200 dark:bg-neutral-700";
  const texto = min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  return (
    <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-base font-bold tabular-nums ${cls}`}>
      <Clock className="size-4" /> {texto}
    </span>
  );
}

function Cartao({ p, agora, avancar, cancelar, reimprimir }: {
  p: PedidoBalcao; agora: number; avancar: (p: PedidoBalcao, s: StatusPedido) => void;
  cancelar: (p: PedidoBalcao) => void; reimprimir: () => void;
}) {
  const prox = PROXIMO[p.status];
  const tipo = TIPO[p.tipo];
  return (
    <li className="animate-surgir rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
      <div className="flex items-start justify-between gap-2">
        <span className="text-5xl leading-none font-black tabular-nums">#{p.numero}</span>
        {p.status === "entregue" ? (
          <span className="text-sm text-neutral-500">{new Date(p.created_at).toLocaleTimeString("pt-BR", { timeStyle: "short" })}</span>
        ) : (
          <Decorrido desde={p.created_at} agora={agora} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold tracking-wide ${tipo.cls}`}>
          <tipo.Icone className="size-4" />
          {tipo.rotulo}{p.tipo === "mesa" && ` ${p.comandas?.mesas?.numero ?? "?"}`}
        </span>
        <span className="truncate text-sm text-neutral-600 dark:text-neutral-300">
          {p.cliente_nome ?? p.membros?.nome}
          {p.tipo === "entrega" && p.bairro_nome && ` · ${p.bairro_nome}`}
        </span>
      </div>
      <ul className="my-2 space-y-1 text-lg">
        {p.pedido_itens.map((i, n) => (
          <li key={n}>
            <span className="font-bold">{i.quantidade}x</span> {i.nome}
            {i.observacao && (
              <span className="mt-0.5 block rounded bg-yellow-100 px-2 py-0.5 text-base font-bold text-yellow-900">» {i.observacao}</span>
            )}
          </li>
        ))}
      </ul>
      {p.observacao && (
        <p className="mb-2 rounded bg-yellow-100 px-2 py-1 font-bold text-yellow-900">Obs: {p.observacao}</p>
      )}
      <div className="flex items-center justify-between border-t border-neutral-200 pt-2 dark:border-neutral-700">
        <span className="text-xl font-bold">{brl(p.total)}</span>
        <span className="flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
          <Printer className="size-3.5" /> {p.impresso_em ? "impresso" : "não impresso"}
        </span>
      </div>
      <div className="mt-2 flex gap-2">
        {prox && (
          <button onClick={() => avancar(p, prox[0])}
            className="h-12 flex-1 rounded-lg bg-neutral-900 text-base font-semibold text-white active:bg-neutral-700 dark:bg-white dark:text-neutral-900">
            {prox[1]}
          </button>
        )}
        <button onClick={reimprimir} aria-label={`Reimprimir pedido ${p.numero}`}
          className="flex size-12 items-center justify-center rounded-lg border border-neutral-300 dark:border-neutral-600">
          <Printer className="size-5" />
        </button>
        {p.status !== "entregue" && (
          <button onClick={() => cancelar(p)} aria-label={`Cancelar pedido ${p.numero}`}
            className="flex size-12 items-center justify-center rounded-lg border border-red-300 text-red-600 dark:border-red-800">
            <Ban className="size-5" />
          </button>
        )}
      </div>
    </li>
  );
}
