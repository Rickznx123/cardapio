"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Plus, Search, X } from "lucide-react";
import { LinhaEditor } from "@/components/linha";
import { toast } from "@/components/toast";
import { adicionar, type LinhaCarrinho, paraRpc } from "@/lib/linhas";
import { createClient } from "@/lib/supabase/client";
import { brl, type CategoriaPublica, type ItemPublico } from "@/lib/tipos";

const supabase = createClient();
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Selecao({ empresaId, mesa, cancelar, enviado }: {
  empresaId: string; mesa: { id: string; numero: number }; cancelar: () => void; enviado: () => void;
}) {
  const [categorias, setCategorias] = useState<CategoriaPublica[]>([]);
  const [itens, setItens] = useState<ItemPublico[]>([]);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);
  const [obsGeral, setObsGeral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("ordem"),
      supabase.from("itens").select("id, categoria_id, nome, descricao, preco, foto_url, disponivel")
        .eq("empresa_id", empresaId).eq("disponivel", true).order("ordem"),
    ]).then(([c, i]) => {
      if (c.error || i.error) return toast.erro((c.error ?? i.error)!.message);
      setCategorias(c.data);
      setItens(i.data as ItemPublico[]);
      setCategoria(c.data[0]?.id ?? null);
    });
  }, [empresaId]);

  const preco = (id: string) => itens.find((i) => i.id === id)?.preco ?? 0;
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const total = linhas.reduce((s, l) => s + preco(l.item_id) * l.quantidade, 0);
  const termo = normalizar(busca.trim());
  const visiveis = termo
    ? itens.filter((i) => normalizar(i.nome).includes(termo))
    : itens.filter((i) => i.categoria_id === categoria);

  async function enviar() {
    setEnviando(true);
    const { error } = await supabase.rpc("criar_pedido_mesa", {
      p_mesa_id: mesa.id,
      p_itens: paraRpc(linhas),
      p_observacao: obsGeral.trim() || null,
    });
    if (error) {
      setEnviando(false);
      return toast.erro(error.message);
    }
    navigator.vibrate?.(80);
    setSucesso(true);
    setTimeout(enviado, 1300);
  }

  if (sucesso) {
    return (
      <main role="status" className="animate-surgir fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-emerald-600 text-white">
        <CircleCheck className="size-24" strokeWidth={1.5} />
        <p className="text-3xl font-bold">Pedido enviado!</p>
        <p className="text-xl">Mesa {mesa.numero} · {qtd} {qtd === 1 ? "item" : "itens"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl pb-44">
      <header className="sticky top-0 z-10 space-y-2 border-b border-neutral-200 bg-(--background) p-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <button onClick={cancelar} aria-label="Cancelar e voltar"
            className="flex size-12 items-center justify-center rounded-full active:bg-neutral-200 dark:active:bg-neutral-800">
            <X className="size-6" />
          </button>
          <h1 className="text-xl font-bold">Mesa {mesa.numero}</h1>
        </div>
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item"
            aria-label="Buscar item"
            className="h-12 w-full rounded-xl border border-neutral-300 bg-transparent pr-3 pl-10 text-base dark:border-neutral-700" />
        </label>
        {!termo && (
          <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {categorias.map((c) => (
              <button key={c.id} onClick={() => setCategoria(c.id)} aria-pressed={c.id === categoria}
                className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
                  c.id === categoria ? "bg-rose-600 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>
                {c.nome}
              </button>
            ))}
          </nav>
        )}
      </header>

      <ul className="divide-y divide-neutral-200 px-3 dark:divide-neutral-800">
        {visiveis.map((i) => {
          const doItem = linhas.filter((l) => l.item_id === i.id);
          const n = doItem.reduce((s, l) => s + l.quantidade, 0);
          return (
            <li key={i.id} className="py-1">
              <button onClick={() => setLinhas(adicionar(linhas, i.id))}
                className="flex min-h-16 w-full items-center gap-3 py-2 text-left active:bg-neutral-100 dark:active:bg-neutral-900">
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-medium">{i.nome}</span>
                  <span className="block text-neutral-500 dark:text-neutral-400">{brl(i.preco)}</span>
                </span>
                {n > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">{n}</span>}
                <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-rose-600 text-white">
                  <Plus className="size-6" />
                </span>
              </button>
              {doItem.map((l) => (
                <div key={l.id} className="mb-2 ml-2 border-l-4 border-rose-200 pl-3 dark:border-rose-900">
                  <LinhaEditor linha={l} linhas={linhas} setLinhas={setLinhas} preco={i.preco} />
                </div>
              ))}
            </li>
          );
        })}
        {termo && !visiveis.length && <li className="py-6 text-center text-neutral-500">Nenhum item com &quot;{busca}&quot;.</li>}
      </ul>

      {qtd > 0 && (
        <div className="fixed inset-x-0 bottom-0 space-y-2 border-t border-neutral-200 bg-(--background) p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] dark:border-neutral-800">
          <input value={obsGeral} onChange={(e) => setObsGeral(e.target.value)} placeholder="Observação do pedido (opcional)"
            aria-label="Observação do pedido"
            className="mx-auto block h-12 w-full max-w-2xl rounded-xl border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700" />
          <button disabled={enviando} onClick={enviar}
            className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between rounded-2xl bg-rose-600 px-5 text-xl font-semibold text-white active:bg-rose-700 disabled:opacity-60">
            <span>{enviando ? "Enviando…" : `Enviar (${qtd})`}</span>
            <span>{brl(total)}</span>
          </button>
        </div>
      )}
    </main>
  );
}
