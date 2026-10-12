"use client";

import { useState } from "react";
import { useArmazenado } from "@/lib/armazenado";
import { adicionar, type LinhaCarrinho } from "@/lib/linhas";
import { type BairroPublico, brl, type CategoriaPublica, type EmpresaPublica, type ItemPublico } from "@/lib/tipos";
import { Checkout } from "./checkout";

type Props = { empresa: EmpresaPublica; categorias: CategoriaPublica[]; itens: ItemPublico[]; bairros: BairroPublico[] };

export function Cardapio({ empresa, categorias, itens, bairros }: Props) {
  const [salvo, setLinhas] = useArmazenado<LinhaCarrinho[]>(`carrinho:${empresa.slug}`, []);
  const [aberto, setAberto] = useState(false);
  const cor = empresa.cor_primaria ?? "#E11D48";
  const podePedir = empresa.aberto && (empresa.aceita_entrega || empresa.aceita_retirada);

  // Ignora formato antigo e itens que saíram do cardápio ou esgotaram desde que foram pro carrinho.
  const porId = new Map(itens.filter((i) => i.disponivel).map((i) => [i.id, i]));
  const linhas = (Array.isArray(salvo) ? salvo : []).filter((l) => porId.has(l.item_id));
  const qtdItem = (id: string) => linhas.reduce((s, l) => s + (l.item_id === id ? l.quantidade : 0), 0);
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const subtotal = linhas.reduce((s, l) => s + porId.get(l.item_id)!.preco * l.quantidade, 0);

  if (aberto && qtd > 0) {
    return (
      <Checkout empresa={empresa} bairros={bairros} linhas={linhas} porId={porId} subtotal={subtotal} cor={cor}
        setLinhas={setLinhas} fechar={() => setAberto(false)} />
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl pb-24">
      <header className="flex items-center gap-3 p-4">
        {empresa.logo_url && <img src={empresa.logo_url} alt="" className="h-14 w-14 rounded-full object-cover" />}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{empresa.nome}</h1>
          {empresa.endereco && <p className="truncate text-sm text-gray-500">{empresa.endereco}</p>}
        </div>
      </header>

      {!empresa.aberto && (
        <p className="mx-4 mb-2 rounded bg-yellow-100 p-3 text-center text-sm text-yellow-900">
          Estamos fechados no momento. Você pode ver o cardápio, mas não fazer pedidos.
        </p>
      )}

      <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b bg-[var(--background)] px-4 py-2">
        {categorias.map((c) => (
          <a key={c.id} href={`#c-${c.id}`} className="shrink-0 rounded-full border px-3 py-1 text-sm">{c.nome}</a>
        ))}
      </nav>

      {categorias.map((c) => (
        <section key={c.id} id={`c-${c.id}`} className="scroll-mt-14 px-4 pt-4">
          <h2 className="mb-2 text-lg font-bold">{c.nome}</h2>
          <ul className="divide-y">
            {itens.filter((i) => i.categoria_id === c.id).map((i) => (
              <li key={i.id} className={`flex gap-3 py-3 ${i.disponivel ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.nome}</p>
                  {i.descricao && <p className="line-clamp-2 text-sm text-gray-500">{i.descricao}</p>}
                  <p className="mt-1 font-semibold">{brl(i.preco)}</p>
                  {!i.disponivel && <p className="text-sm text-red-600">Esgotado</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {i.foto_url && <img src={i.foto_url} alt="" loading="lazy" className="h-20 w-20 rounded object-cover" />}
                  {i.disponivel && podePedir && (
                    <button onClick={() => setLinhas(adicionar(linhas, i.id))} style={{ background: cor }}
                      className="rounded-full px-4 py-1 text-sm font-semibold text-white">
                      Adicionar{qtdItem(i.id) > 0 && ` (${qtdItem(i.id)})`}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {qtd > 0 && podePedir && (
        <div className="fixed inset-x-0 bottom-0 p-3">
          <button onClick={() => setAberto(true)} style={{ background: cor }}
            className="mx-auto flex w-full max-w-2xl justify-between rounded-lg p-4 font-semibold text-white shadow-lg">
            <span>Ver carrinho ({qtd})</span>
            <span>{brl(subtotal)}</span>
          </button>
        </div>
      )}
    </main>
  );
}
