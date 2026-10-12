import { ORIGEM, type PedidoBalcao } from "@/lib/cupom";
import { brl, FORMAS, STATUS } from "@/lib/tipos";

const linha = "flex justify-between gap-3 py-1";
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

// Itens, observações, valores, cliente/endereço e situação de um pedido (usado em Pedidos e Histórico).
export function DetalhePedido({ p }: { p: PedidoBalcao }) {
  return (
    <div className="space-y-4 p-5">
      <ul className="space-y-2">
        {p.pedido_itens.map((i, n) => (
          <li key={n}>
            <div className={linha}><span><b>{i.quantidade}x</b> {i.nome}</span><span>{brl(i.preco * i.quantidade)}</span></div>
            {i.observacao && <p className="rounded bg-yellow-100 px-2 py-0.5 text-sm font-semibold text-yellow-900">» {i.observacao}</p>}
          </li>
        ))}
      </ul>
      {p.observacao && <p className="rounded-lg bg-yellow-100 p-3 font-semibold text-yellow-900">Obs: {p.observacao}</p>}
      <dl className="divide-y divide-neutral-200 text-sm dark:divide-neutral-800">
        <div className={linha}><dt>Subtotal</dt><dd>{brl(p.subtotal)}</dd></div>
        {p.tipo === "entrega" && <div className={linha}><dt>Taxa de entrega</dt><dd>{brl(p.taxa_entrega)}</dd></div>}
        <div className={`${linha} text-base font-bold`}><dt>Total</dt><dd>{brl(p.total)}</dd></div>
        <div className={linha}><dt>Status</dt><dd>{STATUS[p.status]}</dd></div>
        <div className={linha}><dt>Pagamento</dt><dd>{p.forma_pagamento ? FORMAS[p.forma_pagamento] : "A definir"} · {p.pago ? `Pago em ${quando(p.pago_em)}` : "Não pago"}</dd></div>
        {p.troco_para != null && <div className={linha}><dt>Troco</dt><dd>para {brl(p.troco_para)} (levar {brl(p.troco_para - p.total)})</dd></div>}
        {p.cliente_nome && <div className={linha}><dt>Cliente</dt><dd>{p.cliente_nome}</dd></div>}
        {p.cliente_telefone && <div className={linha}><dt>Telefone</dt><dd>{p.cliente_telefone}</dd></div>}
        {p.tipo === "entrega" && <div className={linha}><dt>Endereço</dt><dd className="text-right">{p.endereco} — {p.bairro_nome}</dd></div>}
        {p.tipo === "mesa" && <div className={linha}><dt>Mesa</dt><dd>{p.comandas?.mesas?.numero ?? "?"}</dd></div>}
        {p.membros && <div className={linha}><dt>Garçom</dt><dd>{p.membros.nome}</dd></div>}
        <div className={linha}><dt>Origem</dt><dd>{ORIGEM[p.origem]}</dd></div>
        <div className={linha}><dt>Criado</dt><dd>{quando(p.created_at)}</dd></div>
        <div className={linha}><dt>Impresso</dt><dd>{quando(p.impresso_em)}</dd></div>
      </dl>
    </div>
  );
}
