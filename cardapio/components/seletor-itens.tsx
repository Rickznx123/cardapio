"use client";

import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { LinhaEditor } from "@/components/linha";
import { toast } from "@/components/toast";
import { adicionar, adicionarCom, type LinhaCarrinho } from "@/lib/linhas";
import { createClient } from "@/lib/supabase/client";
import { brl, type CategoriaPublica, type ItemPublico } from "@/lib/tipos";

const supabase = createClient();
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Categorias ativas e itens disponíveis da empresa (leitura pública).
export function useCardapio(empresaId: string) {
  const [dados, setDados] = useState<{ categorias: CategoriaPublica[]; itens: ItemPublico[] } | null>(null);
  useEffect(() => {
    Promise.all([
      supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("ordem"),
      supabase.from("itens").select("id, categoria_id, nome, descricao, preco, foto_url, disponivel, ponto_carne_ativo, ponto_carne_opcoes, ponto_carne_obrigatorio")
        .eq("empresa_id", empresaId).eq("disponivel", true).order("ordem"),
    ]).then(([c, i]) => {
      if (c.error || i.error) return toast.erro((c.error ?? i.error)!.message);
      setDados({ categorias: c.data, itens: i.data as ItemPublico[] });
    });
  }, [empresaId]);
  return dados;
}

// Seleção rápida (garçom e "Novo pedido" do painel): busca, categorias, + grande e linhas com observação.
export function SeletorItens({ categorias, itens, linhas, setLinhas, topo = "top-0" }: {
  categorias: CategoriaPublica[]; itens: ItemPublico[];
  linhas: LinhaCarrinho[]; setLinhas: (l: LinhaCarrinho[]) => void; topo?: string;
}) {
  const [categoria, setCategoria] = useState<string | null>(categorias[0]?.id ?? null);
  const [busca, setBusca] = useState("");
  const [pontos, setPontos] = useState<Record<string, string>>({});
  const termo = normalizar(busca.trim());
  const visiveis = termo
    ? itens.filter((i) => normalizar(i.nome).includes(termo))
    : itens.filter((i) => i.categoria_id === categoria);

  return (
    <div>
      <div className={`sticky ${topo} z-10 space-y-2 border-b border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900`}>
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-neutral-400" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item"
            aria-label="Buscar item"
            className="h-12 w-full rounded-xl border border-neutral-300 bg-transparent pr-3 pl-10 text-base dark:border-neutral-700" />
        </label>
        {!termo && (
          <nav className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {categorias.map((c) => (
              <button key={c.id} type="button" onClick={() => setCategoria(c.id)} aria-pressed={c.id === categoria}
                className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
                  c.id === categoria ? "bg-(--cor) text-(--cor-texto)" : "bg-neutral-100 dark:bg-neutral-800"}`}>
                {c.nome}
              </button>
            ))}
          </nav>
        )}
      </div>

      <ul className="divide-y divide-neutral-200 px-3 dark:divide-neutral-800">
        {visiveis.map((i) => {
          const doItem = linhas.filter((l) => l.item_id === i.id);
          const n = doItem.reduce((s, l) => s + l.quantidade, 0);
          const opcoesPonto = i.ponto_carne_opcoes ?? [];
          const pontoEscolhido = pontos[i.id] ?? "";
          const adicionarItem = () => setLinhas(adicionarCom(linhas, i.id, 1, "", pontoEscolhido || null));
          return (
            <li key={i.id} className="py-1">
              {i.ponto_carne_ativo && (
                <label className="mb-1 block">
                  <span className="sr-only">Ponto da carne para {i.nome}</span>
                  <select value={pontoEscolhido} onChange={(e) => setPontos((p) => ({ ...p, [i.id]: e.target.value }))}
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900">
                    <option value="">{i.ponto_carne_obrigatorio ? "Selecione o ponto da carne" : "Sem preferência de ponto"}</option>
                    {opcoesPonto.map((opcao) => <option key={opcao} value={opcao}>{opcao}</option>)}
                  </select>
                </label>
              )}
              <button type="button" onClick={i.ponto_carne_ativo ? adicionarItem : () => setLinhas(adicionar(linhas, i.id))}
                disabled={Boolean(i.ponto_carne_ativo && i.ponto_carne_obrigatorio && !pontoEscolhido)}
                className="flex min-h-16 w-full items-center gap-3 py-2 text-left active:bg-neutral-100 dark:active:bg-neutral-800">
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-medium">{i.nome}</span>
                  <span className="block text-neutral-500 dark:text-neutral-400">{brl(i.preco)}</span>
                </span>
                {n > 0 && <span className="rounded-full bg-(--cor)/15 px-2.5 py-0.5 font-bold">{n}</span>}
                <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-(--cor) text-(--cor-texto)">
                  <Plus className="size-6" />
                </span>
              </button>
              {doItem.map((l) => (
                <div key={l.id} className="mb-2 ml-2 border-l-4 border-(--cor)/30 pl-3">
                  <LinhaEditor linha={l} linhas={linhas} setLinhas={setLinhas} preco={i.preco} />
                </div>
              ))}
            </li>
          );
        })}
        {termo && !visiveis.length && <li className="py-6 text-center text-neutral-500">Nenhum item com &quot;{busca}&quot;.</li>}
        {!termo && !visiveis.length && <li className="py-6 text-center text-neutral-500">Nenhum item disponível.</li>}
      </ul>
    </div>
  );
}
