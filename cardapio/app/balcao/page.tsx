"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
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
    if (error) return alert(error.message);
    guardar({ ...p, status });
  }

  async function cancelar(p: PedidoBalcao) {
    if (!confirm(`Cancelar o pedido #${p.numero}?`)) return;
    const { error } = await supabase.rpc("cancelar_pedido", { p_id: p.id });
    if (error) return alert(error.message);
    guardar({ ...p, status: "cancelado" });
    if (p.comanda_id) setVersaoMesas((v) => v + 1);
  }

  if (equipe === undefined) return <p className="p-4">Carregando…</p>;
  if (equipe === null) return <p className="p-4">Acesso só para dono ou caixa.</p>;

  return (
    <main className="flex min-h-0 flex-1 flex-col p-3"
      onPointerDown={() => { if (!somLiberado) { audio ??= new AudioContext(); audio.resume(); setSomLiberado(true); } }}>
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{equipe.nome}</h1>
        <span className={`text-sm ${online ? "text-green-700" : "text-red-600"}`}>● {online ? "ao vivo" : "reconectando…"}</span>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Impressão automática
        </label>
        {!somLiberado && <span className="rounded bg-yellow-100 px-2 text-sm">Toque na tela para ativar o som</span>}
        <nav className="ml-auto flex gap-3 text-sm">
          <Link href="/balcao/configurar" className="underline">Configurar impressão</Link>
          {equipe.papel === "dono" && <Link href="/admin" className="underline">Admin</Link>}
        </nav>
      </header>

      <div className="mb-3 flex gap-2">
        {(["pedidos", "mesas"] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)}
            className={`rounded-full px-4 py-2 text-sm ${a === aba ? "bg-rose-600 text-white" : "border"}`}>
            {a === "pedidos" ? "Pedidos" : "Mesas"}
          </button>
        ))}
      </div>

      {aba === "mesas" ? (
        <Mesas empresaId={equipe.empresa_id} empresaNome={equipe.nome} versao={versaoMesas} />
      ) : (
        <div className="flex flex-1 gap-3 overflow-x-auto md:grid md:grid-cols-4">
          {COLUNAS.map((col) => {
            const daColuna = pedidos.filter((p) => p.status === col).sort((a, b) => a.created_at.localeCompare(b.created_at));
            // Entregues: mais recentes primeiro; demais: mais antigos primeiro (fila).
            const ordenados = col === "entregue" ? daColuna.reverse().slice(0, 30) : daColuna;
            return (
              <section key={col} className="w-[85vw] shrink-0 rounded bg-gray-100 p-2 md:w-auto dark:bg-gray-900">
                <h2 className="mb-2 font-bold">{STATUS[col]} ({daColuna.length})</h2>
                <ul className="space-y-2">
                  {ordenados.map((p) => (
                    <Cartao key={p.id} p={p} avancar={avancar} cancelar={cancelar}
                      reimprimir={() => imprimir(cupomPedido(equipe.nome, p))} />
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

function Cartao({ p, avancar, cancelar, reimprimir }: {
  p: PedidoBalcao; avancar: (p: PedidoBalcao, s: StatusPedido) => void;
  cancelar: (p: PedidoBalcao) => void; reimprimir: () => void;
}) {
  const prox = PROXIMO[p.status];
  const origem = p.tipo === "mesa" ? `Mesa ${p.comandas?.mesas?.numero ?? "?"}` : p.tipo === "entrega" ? "Entrega" : "Retirada";
  return (
    <li className="rounded bg-[var(--background)] p-2 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-bold">#{p.numero}</span>
        <span className="text-sm font-semibold">{origem}</span>
      </div>
      <p className="text-xs text-gray-500">
        {new Date(p.created_at).toLocaleTimeString("pt-BR", { timeStyle: "short" })}
        {p.cliente_nome && ` · ${p.cliente_nome}`}
        {p.tipo === "entrega" && p.bairro_nome && ` · ${p.bairro_nome}`}
        {p.membros && ` · ${p.membros.nome}`}
      </p>
      <ul className="my-1 text-sm">
        {p.pedido_itens.map((i, n) => (
          <li key={n}>
            {i.quantidade}x {i.nome}
            {i.observacao && <span className="block pl-3 font-semibold text-rose-700">» {i.observacao}</span>}
          </li>
        ))}
      </ul>
      {p.observacao && <p className="text-sm font-semibold text-rose-700">Obs: {p.observacao}</p>}
      <p className="flex justify-between text-sm">
        <span className="font-bold">{brl(p.total)}</span>
        <span className="text-xs text-gray-500">{p.impresso_em ? "impresso" : "não impresso"}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {prox && (
          <button onClick={() => avancar(p, prox[0])} className="rounded bg-rose-600 px-3 py-1 text-sm font-semibold text-white">
            {prox[1]}
          </button>
        )}
        <button onClick={reimprimir} className="rounded border px-3 py-1 text-sm">Reimprimir</button>
        {p.status !== "entregue" && (
          <button onClick={() => cancelar(p)} className="rounded border px-3 py-1 text-sm text-red-600">Cancelar</button>
        )}
      </div>
    </li>
  );
}
