"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, ChevronLeft, Store } from "lucide-react";
import { LinhaEditor } from "@/components/linha";
import { CampoTroco, EscolhaPagamento, trocoInvalido, trocoNumero } from "@/components/pagamento";
import { gravar } from "@/lib/armazenado";
import { mascaraTelefone } from "@/lib/telefone";
import { type LinhaCarrinho, paraRpc } from "@/lib/linhas";
import { createClient } from "@/lib/supabase/client";
import { type BairroPublico, brl, type EmpresaPublica, type FormaPagamento, type ItemPublico } from "@/lib/tipos";
import type { UltimoPedido } from "./cardapio";

const input =
  "h-14 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base outline-none focus:border-(--cor) focus:ring-2 focus:ring-(--cor)/30";
const ETAPAS = ["Sacola", "Entrega", "Revisar"] as const;

type Props = {
  empresa: EmpresaPublica; bairros: BairroPublico[]; linhas: LinhaCarrinho[]; porId: Map<string, ItemPublico>;
  subtotal: number; setLinhas: (l: LinhaCarrinho[]) => void; fechar: () => void;
};

export function Checkout({ empresa, bairros, linhas, porId, subtotal, setLinhas, fechar }: Props) {
  const router = useRouter();
  const [etapa, setEtapa] = useState(0);
  const [tipo, setTipo] = useState<"entrega" | "retirada">(empresa.aceita_entrega ? "entrega" : "retirada");
  const [bairroId, setBairroId] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState("");
  const [observacao, setObservacao] = useState("");
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [troco, setTroco] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const bairro = tipo === "entrega" ? bairros.find((b) => b.id === bairroId) : undefined;
  const taxa = bairro?.taxa ?? 0;
  const faltaMinimo = bairro && subtotal < bairro.pedido_minimo ? bairro.pedido_minimo - subtotal : 0;
  const total = subtotal + taxa;
  const pagamentoPendente = etapa === 2 && (!forma || (forma === "dinheiro" && trocoInvalido(troco, total)));

  function voltar() {
    setErro("");
    if (etapa === 0) fechar();
    else setEtapa(etapa - 1);
  }

  async function enviar() {
    setErro("");
    setEnviando(true);
    const { data, error } = await createClient().rpc("criar_pedido_publico", {
      p_slug: empresa.slug,
      p_tipo: tipo,
      p_itens: paraRpc(linhas),
      p_cliente_nome: nome.trim(),
      p_cliente_telefone: telefone.trim(),
      p_endereco: tipo === "entrega" ? endereco.trim() : null,
      p_bairro_id: bairro?.id ?? null,
      p_observacao: observacao.trim() || null,
      p_forma_pagamento: forma,
      p_troco_para: forma === "dinheiro" ? trocoNumero(troco) : null,
    });
    if (error) {
      setEnviando(false);
      return setErro(error.message);
    }
    gravar(`ultimo:${empresa.slug}`, { em: new Date().toISOString(), linhas } satisfies UltimoPedido);
    setLinhas([]);
    router.push(`/${empresa.slug}/pedido/${data.id}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col bg-white">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-2 py-2">
        <div className="flex items-center gap-1">
          <button onClick={voltar} aria-label={etapa === 0 ? "Voltar ao cardápio" : "Etapa anterior"}
            className="flex size-12 items-center justify-center rounded-full">
            <ChevronLeft className="size-6" />
          </button>
          <h1 className="text-lg font-bold">{ETAPAS[etapa]}</h1>
          <span className="ml-auto pr-3 text-sm text-neutral-500">Etapa {etapa + 1} de 3</span>
        </div>
        <ol className="flex gap-2 px-3 pb-1" aria-hidden>
          {ETAPAS.map((e, n) => (
            <li key={e} className={`h-1.5 flex-1 rounded-full ${n <= etapa ? "bg-(--cor)" : "bg-neutral-200"}`} />
          ))}
        </ol>
      </header>

      <form className="flex flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (etapa < 2) return setEtapa(etapa + 1);
          enviar();
        }}>
        <div className="flex-1 space-y-4 p-4">
          {etapa === 0 && (
            <ul className="divide-y divide-neutral-200">
              {linhas.map((l) => (
                <li key={l.id}>
                  <LinhaEditor linha={l} linhas={linhas} setLinhas={setLinhas}
                    nome={porId.get(l.item_id)!.nome} preco={porId.get(l.item_id)!.preco} />
                </li>
              ))}
            </ul>
          )}

          {etapa === 1 && (
            <>
              {empresa.aceita_entrega && empresa.aceita_retirada && (
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Como quer receber">
                  {([["entrega", "Entrega", Bike], ["retirada", "Retirada", Store]] as const).map(([v, rotulo, Icone]) => (
                    <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => setTipo(v)}
                      className={`flex h-16 items-center justify-center gap-2 rounded-xl border-2 font-semibold ${
                        tipo === v ? "border-(--cor) bg-(--cor)/10" : "border-neutral-200"}`}>
                      <Icone className="size-5" /> {rotulo}
                    </button>
                  ))}
                </div>
              )}
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Seu nome</span>
                <input required value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" className={input} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Telefone / WhatsApp</span>
                <input required type="tel" inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000"
                  value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                  pattern=".{14,}" title="Informe o telefone com DDD" className={input} />
              </label>
              {tipo === "entrega" ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Bairro</span>
                    <select required value={bairroId} onChange={(e) => setBairroId(e.target.value)} className={input}>
                      <option value="">Selecione o bairro</option>
                      {bairros.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome} — {b.taxa === 0 ? "grátis" : brl(b.taxa)}{b.pedido_minimo > 0 ? ` (mín. ${brl(b.pedido_minimo)})` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Endereço</span>
                    <input required value={endereco} onChange={(e) => setEndereco(e.target.value)}
                      placeholder="Rua, número, complemento" autoComplete="street-address" className={input} />
                  </label>
                </>
              ) : (
                empresa.endereco && (
                  <p className="rounded-xl bg-neutral-100 p-4 text-sm"><b>Retirar em:</b> {empresa.endereco}</p>
                )
              )}
            </>
          )}

          {etapa === 2 && (
            <>
              <section className="rounded-2xl border border-neutral-200 p-4">
                <h2 className="mb-2 font-semibold">Itens</h2>
                <ul className="space-y-1.5 text-sm">
                  {linhas.map((l) => {
                    const i = porId.get(l.item_id)!;
                    return (
                      <li key={l.id}>
                        <div className="flex justify-between gap-2"><span>{l.quantidade}x {i.nome}</span><span>{brl(i.preco * l.quantidade)}</span></div>
                        {l.observacao.trim() && <p className="text-neutral-500">» {l.observacao}</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
              <section className="rounded-2xl border border-neutral-200 p-4 text-sm">
                <h2 className="mb-1 font-semibold">{tipo === "entrega" ? "Entrega" : "Retirada"}</h2>
                <p>{nome} · {telefone}</p>
                {tipo === "entrega" && <p className="text-neutral-600">{endereco} — {bairro?.nome}</p>}
              </section>
              <section className="space-y-3">
                <h2 className="font-semibold">Como vai pagar?</h2>
                <EscolhaPagamento valor={forma} mudar={(f) => { setForma(f); if (f !== "dinheiro") setTroco(null); }} />
                {forma === "dinheiro" && <CampoTroco total={total} valor={troco} mudar={setTroco} />}
                <p className="text-xs text-neutral-500">O pagamento é feito na entrega ou na retirada.</p>
              </section>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Observação do pedido (opcional)</span>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} maxLength={300}
                  placeholder="Ex.: troco para R$ 50, interfone 12…"
                  className="w-full rounded-xl border border-neutral-300 p-4 text-base outline-none focus:border-(--cor) focus:ring-2 focus:ring-(--cor)/30" />
              </label>
            </>
          )}
        </div>

        <footer className="sticky bottom-0 space-y-3 border-t border-neutral-200 bg-white p-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {etapa > 0 && (
            <dl className="space-y-1.5 text-neutral-600">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{brl(subtotal)}</dd></div>
              {tipo === "entrega" && <div className="flex justify-between"><dt>Taxa de entrega</dt><dd>{bairro ? brl(taxa) : "—"}</dd></div>}
              <div className="flex justify-between pt-1 text-lg font-bold text-neutral-900"><dt>Total</dt><dd>{brl(subtotal + taxa)}</dd></div>
            </dl>
          )}
          {faltaMinimo > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Pedido mínimo para {bairro!.nome}: {brl(bairro!.pedido_minimo)}. Faltam {brl(faltaMinimo)}.
            </p>
          )}
          {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
          <button disabled={enviando || (etapa > 0 && faltaMinimo > 0) || pagamentoPendente}
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-(--cor) px-5 text-lg font-semibold text-(--cor-texto) disabled:opacity-50">
            <span>{etapa === 0 ? "Continuar" : etapa === 1 ? "Revisar pedido" : enviando ? "Enviando…" : "Confirmar pedido"}</span>
            <span>{brl(subtotal + (etapa > 0 ? taxa : 0))}</span>
          </button>
        </footer>
      </form>
    </main>
  );
}
