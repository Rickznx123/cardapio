"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LinhaEditor } from "@/components/linha";
import { type LinhaCarrinho, paraRpc } from "@/lib/linhas";
import { createClient } from "@/lib/supabase/client";
import { type BairroPublico, brl, type EmpresaPublica, type ItemPublico } from "@/lib/tipos";

const input = "w-full rounded border p-3";

type Props = {
  empresa: EmpresaPublica; bairros: BairroPublico[]; linhas: LinhaCarrinho[]; porId: Map<string, ItemPublico>;
  subtotal: number; cor: string; setLinhas: (l: LinhaCarrinho[]) => void; fechar: () => void;
};

export function Checkout({ empresa, bairros, linhas, porId, subtotal, cor, setLinhas, fechar }: Props) {
  const router = useRouter();
  const [tipo, setTipo] = useState<"entrega" | "retirada">(empresa.aceita_entrega ? "entrega" : "retirada");
  const [bairroId, setBairroId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const bairro = tipo === "entrega" ? bairros.find((b) => b.id === bairroId) : undefined;
  const taxa = bairro?.taxa ?? 0;
  const faltaMinimo = bairro && subtotal < bairro.pedido_minimo ? bairro.pedido_minimo - subtotal : 0;

  async function enviar(f: FormData) {
    setErro("");
    setEnviando(true);
    const campo = (k: string) => String(f.get(k) ?? "").trim();
    const { data, error } = await createClient().rpc("criar_pedido_publico", {
      p_slug: empresa.slug,
      p_tipo: tipo,
      p_itens: paraRpc(linhas),
      p_cliente_nome: campo("nome"),
      p_cliente_telefone: campo("telefone"),
      p_endereco: tipo === "entrega" ? campo("endereco") : null,
      p_bairro_id: bairro?.id ?? null,
      p_observacao: campo("observacao") || null,
    });
    if (error) {
      setEnviando(false);
      return setErro(error.message);
    }
    setLinhas([]);
    router.push(`/${empresa.slug}/pedido/${data.id}`);
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pb-28">
      <button onClick={fechar} className="mb-3 text-sm underline">← Voltar ao cardápio</button>
      <h1 className="mb-3 text-xl font-bold">Seu pedido</h1>

      <ul className="mb-4 divide-y">
        {linhas.map((l) => (
          <li key={l.id}>
            <LinhaEditor linha={l} linhas={linhas} setLinhas={setLinhas}
              nome={porId.get(l.item_id)!.nome} preco={porId.get(l.item_id)!.preco} />
          </li>
        ))}
      </ul>

      <form onSubmit={(e) => { e.preventDefault(); enviar(new FormData(e.currentTarget)); }} className="space-y-3">
        <div className="flex gap-2">
          {empresa.aceita_entrega && (
            <button type="button" onClick={() => setTipo("entrega")}
              className={`flex-1 rounded border p-3 ${tipo === "entrega" ? "font-semibold text-white" : ""}`}
              style={tipo === "entrega" ? { background: cor } : undefined}>Entrega</button>
          )}
          {empresa.aceita_retirada && (
            <button type="button" onClick={() => setTipo("retirada")}
              className={`flex-1 rounded border p-3 ${tipo === "retirada" ? "font-semibold text-white" : ""}`}
              style={tipo === "retirada" ? { background: cor } : undefined}>Retirada</button>
          )}
        </div>

        <input name="nome" required placeholder="Seu nome" autoComplete="name" className={input} />
        <input name="telefone" required type="tel" inputMode="tel" placeholder="Telefone / WhatsApp"
          autoComplete="tel" className={input} />

        {tipo === "entrega" ? (
          <>
            <select required value={bairroId} onChange={(e) => setBairroId(e.target.value)} className={input}>
              <option value="">Selecione o bairro</option>
              {bairros.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome} — taxa {brl(b.taxa)}{b.pedido_minimo > 0 ? ` (mín. ${brl(b.pedido_minimo)})` : ""}
                </option>
              ))}
            </select>
            <input name="endereco" required placeholder="Rua, número, complemento" autoComplete="street-address" className={input} />
          </>
        ) : (
          empresa.endereco && <p className="text-sm">Retirar em: {empresa.endereco}</p>
        )}

        <textarea name="observacao" placeholder="Observação (opcional)" className={input} />

        <dl className="space-y-1 border-t pt-3">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{brl(subtotal)}</dd></div>
          {tipo === "entrega" && <div className="flex justify-between"><dt>Taxa de entrega</dt><dd>{bairro ? brl(taxa) : "—"}</dd></div>}
          <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{brl(subtotal + taxa)}</dd></div>
        </dl>

        {faltaMinimo > 0 && (
          <p className="text-sm text-red-600">
            Pedido mínimo para {bairro!.nome}: {brl(bairro!.pedido_minimo)}. Faltam {brl(faltaMinimo)}.
          </p>
        )}
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <button disabled={enviando || faltaMinimo > 0} style={{ background: cor }}
          className="w-full rounded-lg p-4 font-semibold text-white disabled:opacity-50">
          {enviando ? "Enviando…" : "Fazer pedido"}
        </button>
      </form>
    </main>
  );
}
