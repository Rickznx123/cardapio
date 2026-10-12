"use client";

import { useEffect, useState } from "react";
import { Bike, ChevronLeft, Store } from "lucide-react";
import { Modal } from "@/components/modal";
import { CampoTroco, EscolhaPagamento, trocoInvalido, trocoNumero } from "@/components/pagamento";
import { SeletorItens, useCardapio } from "@/components/seletor-itens";
import { toast } from "@/components/toast";
import { type LinhaCarrinho, paraRpc } from "@/lib/linhas";
import { createClient } from "@/lib/supabase/client";
import { mascaraTelefone } from "@/lib/telefone";
import { type BairroPublico, brl, type FormaPagamento } from "@/lib/tipos";

const supabase = createClient();
const campo = "h-11 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700 dark:bg-neutral-900";

// Pedido lançado pela equipe (telefone, balcão). Preço e taxa calculados no banco (criar_pedido_balcao).
export function NovoPedido({ empresaId, fechar }: { empresaId: string; fechar: () => void }) {
  const cardapio = useCardapio(empresaId);
  const [bairros, setBairros] = useState<BairroPublico[]>([]);
  const [etapa, setEtapa] = useState<"itens" | "dados">("itens");
  const [linhas, setLinhas] = useState<LinhaCarrinho[]>([]);
  const [tipo, setTipo] = useState<"retirada" | "entrega">("retirada");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [bairroId, setBairroId] = useState("");
  const [endereco, setEndereco] = useState("");
  const [observacao, setObservacao] = useState("");
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [troco, setTroco] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase.from("bairros").select("id, nome, taxa, pedido_minimo").eq("empresa_id", empresaId).eq("ativo", true).order("nome")
      .then(({ data }) => setBairros((data ?? []) as BairroPublico[]));
  }, [empresaId]);

  const preco = (id: string) => cardapio?.itens.find((i) => i.id === id)?.preco ?? 0;
  const qtd = linhas.reduce((s, l) => s + l.quantidade, 0);
  const subtotal = linhas.reduce((s, l) => s + preco(l.item_id) * l.quantidade, 0);
  const bairro = tipo === "entrega" ? bairros.find((b) => b.id === bairroId) : undefined;
  const total = subtotal + (bairro?.taxa ?? 0);

  async function criar() {
    setEnviando(true);
    const { data, error } = await supabase.rpc("criar_pedido_balcao", {
      p_empresa_id: empresaId,
      p_tipo: tipo,
      p_itens: paraRpc(linhas),
      p_cliente_nome: nome.trim() || null,
      p_cliente_telefone: telefone.trim() || null,
      p_endereco: tipo === "entrega" ? endereco.trim() : null,
      p_bairro_id: bairro?.id ?? null,
      p_observacao: observacao.trim() || null,
      p_forma_pagamento: forma,
      p_troco_para: forma === "dinheiro" ? trocoNumero(troco) : null,
    });
    setEnviando(false);
    if (error) return toast.erro(error.message);
    toast.ok(`Pedido #${data.numero} criado`);
    fechar(); // o Realtime traz o pedido para a lista (e imprime, se a impressão automática estiver ligada)
  }

  const rodape = etapa === "itens" ? (
    <button disabled={!qtd} onClick={() => setEtapa("dados")}
      className="flex h-12 w-full items-center justify-between rounded-lg bg-rose-600 px-4 font-semibold text-white disabled:opacity-50">
      <span>Continuar · {qtd} {qtd === 1 ? "item" : "itens"}</span><span>{brl(subtotal)}</span>
    </button>
  ) : (
    <div className="flex gap-2">
      <button onClick={() => setEtapa("itens")} aria-label="Voltar aos itens"
        className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-neutral-300 dark:border-neutral-700">
        <ChevronLeft className="size-5" />
      </button>
      <button type="submit" form="novo-pedido" disabled={enviando || (forma === "dinheiro" && trocoInvalido(troco, total))}
        className="flex h-12 flex-1 items-center justify-between rounded-lg bg-rose-600 px-4 font-semibold text-white disabled:opacity-50">
        <span>{enviando ? "Criando…" : "Criar pedido"}</span><span>{brl(total)}</span>
      </button>
    </div>
  );

  return (
    <Modal titulo={etapa === "itens" ? "Novo pedido · itens" : "Novo pedido · dados"} fechar={fechar} rodape={rodape} tamanho="sm:max-w-2xl">
      {etapa === "itens" ? (
        cardapio ? (
          <SeletorItens categorias={cardapio.categorias} itens={cardapio.itens} linhas={linhas} setLinhas={setLinhas} />
        ) : (
          <p className="p-6 text-center text-neutral-500">Carregando cardápio…</p>
        )
      ) : (
        <form id="novo-pedido" className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); criar(); }}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo do pedido">
            {([["retirada", "Retirada", Store], ["entrega", "Entrega", Bike]] as const).map(([v, rotulo, Icone]) => (
              <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => setTipo(v)}
                className={`flex h-12 items-center justify-center gap-2 rounded-xl border-2 font-semibold ${
                  tipo === v ? "border-(--cor) bg-(--cor)/10" : "border-neutral-200 dark:border-neutral-700"}`}>
                <Icone className="size-5" /> {rotulo}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-sm font-medium">Cliente{tipo === "retirada" && " (opcional)"}</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} required={tipo === "entrega"} className={campo} />
            </label>
            <label className="block"><span className="mb-1 block text-sm font-medium">Telefone{tipo === "retirada" && " (opcional)"}</span>
              <input value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} type="tel" inputMode="tel"
                required={tipo === "entrega"} placeholder="(00) 00000-0000" className={campo} />
            </label>
          </div>
          {tipo === "entrega" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-sm font-medium">Bairro</span>
                <select value={bairroId} onChange={(e) => setBairroId(e.target.value)} required className={campo}>
                  <option value="">Selecione</option>
                  {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome} — {brl(b.taxa)}</option>)}
                </select>
              </label>
              <label className="block"><span className="mb-1 block text-sm font-medium">Endereço</span>
                <input value={endereco} onChange={(e) => setEndereco(e.target.value)} required className={campo} />
              </label>
            </div>
          )}
          {bairro && subtotal < bairro.pedido_minimo && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pedido mínimo para {bairro.nome}: {brl(bairro.pedido_minimo)}.</p>
          )}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Pagamento (opcional)</h3>
            <EscolhaPagamento valor={forma} mudar={(f) => { setForma(f); if (f !== "dinheiro") setTroco(null); }} />
            {forma === "dinheiro" && <CampoTroco total={total} valor={troco} mudar={setTroco} />}
          </section>
          <label className="block"><span className="mb-1 block text-sm font-medium">Observação</span>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={campo} />
          </label>
        </form>
      )}
    </Modal>
  );
}
