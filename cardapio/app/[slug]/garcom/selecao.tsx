"use client";

import { useEffect, useState } from "react";
import { LinhaEditor } from "@/components/linha";
import { adicionar, type LinhaCarrinho, paraRpc } from "@/lib/linhas";
import { createClient } from "@/lib/supabase/client";
import { brl, type CategoriaPublica, type ItemPublico } from "@/lib/tipos";

const supabase = createClient();

export function Selecao({ empresaId, mesa, cancelar, enviado }: {
  empresaId: string; mesa: { id: string; numero: number }; cancelar: () => void; enviado: () => void;
}) {
  const [categorias, setCategorias] = useState<CategoriaPublica[]>([]);
  const [itens, setItens] = useState<ItemPublico[]>([]);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);
  const [obsGeral, setObsGeral] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("ordem"),
      supabase.from("itens").select("id, categoria_id, nome, descricao, preco, foto_url, disponivel")
        .eq("empresa_id", empresaId).eq("disponivel", true).order("ordem"),
    ]).then(([c, i]) => {
      if (c.error || i.error) return alert((c.error ?? i.error)!.message);
      setCategorias(c.data);
      setItens(i.data as ItemPublico[]);
      setCategoria(c.data[0]?.id ?? null);
    });
  }, [empresaId]);

  const preco = (id: string) => itens.find((i) => i.id === id)?.preco ?? 0;
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const total = linhas.reduce((s, l) => s + preco(l.item_id) * l.quantidade, 0);

  async function enviar() {
    setEnviando(true);
    const { error } = await supabase.rpc("criar_pedido_mesa", {
      p_mesa_id: mesa.id,
      p_itens: paraRpc(linhas),
      p_observacao: obsGeral.trim() || null,
    });
    if (error) {
      setEnviando(false);
      return alert(error.message);
    }
    enviado();
  }

  return (
    <main className="mx-auto w-full max-w-2xl pb-40">
      <header className="sticky top-0 z-10 space-y-2 border-b bg-[var(--background)] p-3">
        <div className="flex items-center justify-between">
          <button onClick={cancelar} className="text-sm underline">← Cancelar</button>
          <h1 className="font-bold">Mesa {mesa.numero}</h1>
        </div>
        <nav className="flex gap-2 overflow-x-auto">
          {categorias.map((c) => (
            <button key={c.id} onClick={() => setCategoria(c.id)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm ${c.id === categoria ? "bg-rose-600 text-white" : "border"}`}>
              {c.nome}
            </button>
          ))}
        </nav>
      </header>

      <ul className="divide-y px-3">
        {itens.filter((i) => i.categoria_id === categoria).map((i) => {
          const doItem = linhas.filter((l) => l.item_id === i.id);
          return (
            <li key={i.id} className="py-2">
              <button onClick={() => setLinhas(adicionar(linhas, i.id))} className="flex w-full items-center gap-3 py-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{i.nome}</span>
                  <span className="block text-sm text-gray-500">{brl(i.preco)}</span>
                </span>
                <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-lg text-white">+</span>
              </button>
              {doItem.map((l) => (
                <div key={l.id} className="ml-3 border-l-2 border-rose-200 pl-3">
                  <LinhaEditor linha={l} linhas={linhas} setLinhas={setLinhas} preco={i.preco} />
                </div>
              ))}
            </li>
          );
        })}
      </ul>

      {qtd > 0 && (
        <div className="fixed inset-x-0 bottom-0 space-y-2 border-t bg-[var(--background)] p-3">
          <input value={obsGeral} onChange={(e) => setObsGeral(e.target.value)} placeholder="Observação do pedido (opcional)"
            className="mx-auto block w-full max-w-2xl rounded border p-2 text-sm" />
          <button disabled={enviando} onClick={enviar}
            className="mx-auto flex w-full max-w-2xl justify-between rounded-lg bg-rose-600 p-4 font-semibold text-white disabled:opacity-50">
            <span>{enviando ? "Enviando…" : `Enviar (${qtd})`}</span>
            <span>{brl(total)}</span>
          </button>
        </div>
      )}
    </main>
  );
}
