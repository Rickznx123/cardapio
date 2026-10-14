"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, History, Minus, PackagePlus, Search } from "lucide-react";
import { toast } from "@/components/toast";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type EstoqueLinha = {
  item_id: string; controlado: boolean; quantidade: number; minimo: number;
  indisponivel_zerado: boolean; nome: string; categoria_id: string; disponivel: boolean;
};
type Categoria = { id: string; nome: string };
type Movimentacao = {
  id: string; item_nome: string; tipo: string; quantidade: number; saldo_resultante: number;
  usuario_nome: string; observacao: string | null; created_at: string;
};

const ROTULO_MOVIMENTO: Record<string, string> = {
  entrada: "Entrada", saida_manual: "Saída manual", perda: "Perda", ajuste: "Ajuste",
  venda: "Venda", devolucao_cancelamento: "Devolução de cancelamento",
};
const campo = "h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function Estoque({ empresaId, podeAlterar }: { empresaId: string; podeAlterar: boolean }) {
  const [estoques, setEstoques] = useState<EstoqueLinha[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const [observacoes, setObservacoes] = useState<Record<string, string>>({});
  const [historicoAberto, setHistoricoAberto] = useState<string | null>(null);
  const [historicos, setHistoricos] = useState<Record<string, Movimentacao[]>>({});

  const carregar = useCallback(async () => {
    const [c, e] = await Promise.all([
      supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("ordem"),
      supabase.from("estoque_itens")
        .select("item_id, controlado, quantidade, minimo, indisponivel_zerado")
        .eq("empresa_id", empresaId).eq("controlado", true),
    ]);
    if (c.error || e.error) {
      toast.erro((c.error ?? e.error)!.message);
      return;
    }
    const ids = (e.data ?? []).map((x) => x.item_id);
    const itens = ids.length
      ? await supabase.from("itens").select("id, nome, categoria_id, disponivel").in("id", ids)
      : { data: [], error: null };
    if (itens.error) {
      toast.erro(itens.error.message);
      return;
    }
    const porId = new Map((itens.data ?? []).map((item) => [item.id, item]));
    setCategorias(c.data ?? []);
    setEstoques((e.data ?? [])
      .flatMap((estoque) => {
        const item = porId.get(estoque.item_id);
        return item ? [{ ...estoque, nome: item.nome, categoria_id: item.categoria_id, disponivel: item.disponivel }] : [];
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
  }, [empresaId]);

  useEffect(() => {
    const timer = setTimeout(() => { void carregar(); }, 0);
    return () => clearTimeout(timer);
  }, [carregar]);

  async function movimentar(itemId: string, tipo: "entrada" | "saida_manual" | "perda" | "ajuste") {
    const texto = tipo === "ajuste" ? ajustes[itemId] ?? "" : quantidades[itemId] ?? "1";
    const quantidade = Number(texto);
    if (!Number.isInteger(quantidade) || quantidade < 0 || (tipo !== "ajuste" && quantidade === 0)) {
      return toast.erro(tipo === "ajuste" ? "Informe o saldo contado (inteiro igual ou maior que zero)" : "Informe uma quantidade inteira maior que zero");
    }
    const { data, error } = await supabase.rpc("registrar_movimentacao_estoque", {
      p_item_id: itemId,
      p_tipo: tipo,
      p_quantidade: quantidade,
      p_observacao: observacoes[itemId]?.trim() || null,
    });
    if (error) return toast.erro(error.message);
    toast.ok(`Estoque atualizado: ${data} unidade(s)`);
    await carregar();
    if (historicoAberto === itemId) await carregarHistorico(itemId);
  }

  async function carregarHistorico(itemId: string) {
    const { data, error } = await supabase.from("estoque_movimentacoes")
      .select("id, item_nome, tipo, quantidade, saldo_resultante, usuario_nome, observacao, created_at")
      .eq("empresa_id", empresaId).eq("item_id", itemId).order("created_at", { ascending: false }).limit(100);
    if (error) return toast.erro(error.message);
    setHistoricos((h) => ({ ...h, [itemId]: data ?? [] }));
  }

  const alternarHistorico = (itemId: string) => {
    if (historicoAberto === itemId) {
      setHistoricoAberto(null);
      return;
    }
    setHistoricoAberto(itemId);
    void carregarHistorico(itemId);
  };

  const termo = busca.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtrados = (estoques ?? []).filter((item) =>
    (!categoria || item.categoria_id === categoria) &&
    (!termo || item.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(termo)),
  );

  return (
    <section className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        Controle de quantidades físicas, sem custos ou valores contábeis. Estoque baixo fica abaixo do mínimo configurado.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
          <input className={`${campo} pl-9`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item" aria-label="Buscar item no estoque" />
        </label>
        <select className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      {estoques === null ? (
        <p className="rounded-xl bg-neutral-100 p-6 text-center text-neutral-500 dark:bg-neutral-900">Carregando estoque…</p>
      ) : filtrados.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-neutral-500 dark:border-neutral-700">
          {estoques.length ? "Nenhum item corresponde à busca." : "Nenhum item com controle de estoque ativado."}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtrados.map((item) => {
            const zerado = item.quantidade === 0;
            const baixo = !zerado && item.quantidade < item.minimo;
            const classe = zerado
              ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
              : baixo ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900";
            return (
              <li key={item.item_id} className={`overflow-hidden rounded-xl border ${classe}`}>
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{item.nome}</h2>
                      <p className="text-sm text-neutral-500">{categorias.find((c) => c.id === item.categoria_id)?.nome ?? "Sem categoria"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-sm font-bold ${
                      zerado ? "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100"
                        : baixo ? "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}`}>
                      {zerado ? "Zerado" : baixo ? "Estoque baixo" : "Disponível"} · {item.quantidade} un.
                    </span>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    Mínimo: {item.minimo} · Cardápio: {item.disponivel ? "disponível" : "indisponível"}
                  </p>
                  {podeAlterar && (
                    <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="col-span-2 sm:col-span-1">
                          <span className="mb-1 block text-xs font-medium">Quantidade</span>
                          <input className={campo} type="number" min="1" step="1" value={quantidades[item.item_id] ?? "1"}
                            onChange={(e) => setQuantidades((q) => ({ ...q, [item.item_id]: e.target.value }))} />
                        </label>
                        <button type="button" onClick={() => void movimentar(item.item_id, "entrada")}
                          className="mt-auto inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700">
                          <PackagePlus className="size-4" /> Entrada
                        </button>
                        <button type="button" onClick={() => void movimentar(item.item_id, "saida_manual")}
                          className="mt-auto inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-neutral-300 px-3 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                          <Minus className="size-4" /> Saída
                        </button>
                        <button type="button" onClick={() => void movimentar(item.item_id, "perda")}
                          className="mt-auto h-10 rounded-lg border border-red-300 px-3 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950">
                          Perda
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                        <label>
                          <span className="mb-1 block text-xs font-medium">Ajuste direto · saldo contado</span>
                          <input className={campo} type="number" min="0" step="1" placeholder="Ex.: 24" value={ajustes[item.item_id] ?? ""}
                            onChange={(e) => setAjustes((a) => ({ ...a, [item.item_id]: e.target.value }))} />
                        </label>
                        <label>
                          <span className="mb-1 block text-xs font-medium">Observação (opcional)</span>
                          <input className={campo} maxLength={300} placeholder="Ex.: contagem na prateleira"
                            value={observacoes[item.item_id] ?? ""}
                            onChange={(e) => setObservacoes((o) => ({ ...o, [item.item_id]: e.target.value }))} />
                        </label>
                        <button type="button" disabled={(ajustes[item.item_id] ?? "") === ""}
                          onClick={() => void movimentar(item.item_id, "ajuste")}
                          className="mt-auto h-10 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900">
                          Ajustar
                        </button>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => alternarHistorico(item.item_id)}
                    className="inline-flex h-9 items-center gap-2 text-sm font-medium text-neutral-700 hover:underline dark:text-neutral-200">
                    <History className="size-4" /> Histórico
                    {historicoAberto === item.item_id ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>
                </div>
                {historicoAberto === item.item_id && (
                  <div className="border-t border-neutral-200 bg-white/70 p-3 dark:border-neutral-700 dark:bg-neutral-900/70">
                    {!historicos[item.item_id] ? <p className="text-sm text-neutral-500">Carregando histórico…</p>
                      : historicos[item.item_id].length === 0 ? <p className="text-sm text-neutral-500">Nenhuma movimentação registrada.</p>
                        : <ul className="space-y-2">
                          {historicos[item.item_id].map((m) => (
                            <li key={m.id} className="grid gap-x-3 gap-y-1 border-b border-neutral-100 pb-2 text-sm last:border-0 dark:border-neutral-800 sm:grid-cols-[1fr_auto]">
                              <span className="font-medium">{ROTULO_MOVIMENTO[m.tipo] ?? m.tipo}: {m.quantidade > 0 ? "+" : ""}{m.quantidade} · saldo {m.saldo_resultante}</span>
                              <time className="text-xs text-neutral-500">{new Date(m.created_at).toLocaleString("pt-BR")}</time>
                              <span className="text-xs text-neutral-500">{m.usuario_nome}{m.observacao ? ` · ${m.observacao}` : ""}</span>
                            </li>
                          ))}
                        </ul>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
