"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, MessageCircle, Search } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { toast } from "@/components/toast";
import { linkWhatsApp } from "@/lib/telefone";
import { brl } from "@/lib/tipos";
import { createClient } from "@/lib/supabase/client";
import { Recuperador } from "./recuperador";

const supabase = createClient();
type Cliente = {
  id: string; nome: string | null; telefone: string; endereco: string | null; bairro_id: string | null;
  primeiro_pedido: string | null; ultimo_pedido: string | null; total_pedidos: number; total_gasto: number;
  optout_ofertas: boolean;
};
type Pedido = {
  id: string; numero: number; tipo: string; status: string; created_at: string; total: number; subtotal: number;
  desconto: number; cupom: { codigo: string } | null;
};
type Filtro = "todos" | "inativos" | "gastam" | "novos";
const dataHora = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const dataCurta = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export function Clientes({ empresaId, empresaNome }: { empresaId: string; empresaNome: string }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [dias, setDias] = useState(30);
  const [selecionado, setSelecionado] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [historicoCarregado, setHistoricoCarregado] = useState(false);
  const [aba, setAba] = useState<"clientes" | "recuperador">("clientes");
  const [carregando, setCarregando] = useState(true);
  const [agora] = useState(() => Date.now());

  useEffect(() => {
    let ativo = true;
    supabase.from("clientes").select("*").eq("empresa_id", empresaId).order("ultimo_pedido", { ascending: false })
      .limit(1000).then(({ data, error }) => {
        if (!ativo) return;
        if (error) toast.erro(error.message);
        else setClientes((data ?? []) as Cliente[]);
        setCarregando(false);
      });
    return () => { ativo = false; };
  }, [empresaId]);

  useEffect(() => {
    if (!selecionado) return;
    let ativo = true;
    supabase.from("pedidos")
      .select("id,numero,tipo,status,created_at,total,subtotal,desconto,cupom:cupons(codigo)")
      .eq("cliente_id", selecionado.id).order("created_at", { ascending: false }).limit(100)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) toast.erro(error.message);
        else setPedidos((data ?? []) as unknown as Pedido[]);
        setHistoricoCarregado(true);
      });
    return () => { ativo = false; };
  }, [selecionado]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    const limite = agora - dias * 86_400_000;
    return clientes.filter((c) => {
      const corresponde = !q || `${c.nome ?? ""} ${c.telefone}`.toLocaleLowerCase("pt-BR").includes(q);
      if (!corresponde) return false;
      if (filtro === "inativos") return !!c.ultimo_pedido && Date.parse(c.ultimo_pedido) < limite;
      if (filtro === "novos") return !!c.primeiro_pedido && Date.parse(c.primeiro_pedido) >= agora - 30 * 86_400_000;
      return true;
    }).sort((a, b) => filtro === "gastam"
      ? Number(b.total_gasto) - Number(a.total_gasto)
      : Date.parse(b.ultimo_pedido ?? "") - Date.parse(a.ultimo_pedido ?? ""));
  }, [agora, busca, clientes, dias, filtro]);

  function exportar() {
    const esc = (s: unknown) => {
      const texto = String(s ?? "");
      return `"${`${/^[=+\-@]/.test(texto) ? "'" : ""}${texto}`.replace(/"/g, '""')}"`;
    };
    const linhas = [
      ["Nome", "Telefone", "Endereço", "Pedidos", "Total gasto", "Primeiro pedido", "Último pedido", "Opt-out"],
      ...visiveis.map((c) => [c.nome, c.telefone, c.endereco, c.total_pedidos, Number(c.total_gasto).toFixed(2).replace(".", ","), c.primeiro_pedido, c.ultimo_pedido, c.optout_ofertas ? "Sim" : "Não"]),
    ];
    const conteudo = "\uFEFF" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "clientes.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  const botaoAba = (id: typeof aba, titulo: string) => (
    <button onClick={() => setAba(id)} aria-pressed={aba === id}
      className={`h-10 rounded-lg px-3 text-sm font-semibold ${aba === id ? "bg-rose-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}>
      {titulo}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{botaoAba("clientes", "Lista de clientes")}{botaoAba("recuperador", "Recuperador")}</div>
      {aba === "recuperador" ? <Recuperador empresaId={empresaId} empresaNome={empresaNome} /> : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="relative min-w-48 flex-1">
              <span className="sr-only">Buscar clientes</span>
              <Search className="absolute left-3 top-3 size-5 text-neutral-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou telefone"
                className="h-11 w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-3 dark:border-neutral-700 dark:bg-neutral-900" />
            </label>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}
              className="h-11 rounded-lg border border-neutral-300 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900">
              <option value="todos">Todos</option><option value="inativos">Inativos</option>
              <option value="gastam">Mais gastam</option><option value="novos">Novos (30 dias)</option>
            </select>
            {filtro === "inativos" && (
              <label className="flex h-11 items-center gap-2 text-sm">Sem comprar há
                <input type="number" min={1} max={3650} value={dias} onChange={(e) => setDias(Math.max(1, Number(e.target.value)))}
                  className="h-10 w-20 rounded-lg border border-neutral-300 bg-white px-2 dark:border-neutral-700 dark:bg-neutral-900" />
                dias
              </label>
            )}
            <button onClick={exportar} disabled={!visiveis.length}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-neutral-300 px-3 text-sm font-semibold disabled:opacity-50 dark:border-neutral-700">
              <Download className="size-4" /> CSV
            </button>
          </div>
          <p className="text-sm text-neutral-500">{visiveis.length} cliente(s)</p>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-neutral-100 dark:bg-neutral-900"><tr>
                <th className="p-3">Cliente</th><th className="p-3">Telefone</th><th className="p-3">Pedidos</th>
                <th className="p-3">Total</th><th className="p-3">Último pedido</th>
              </tr></thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {visiveis.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900" onClick={() => { setPedidos([]); setHistoricoCarregado(false); setSelecionado(c); }}>
                    <td className="p-3 font-medium">{c.nome || "Sem nome"}{c.optout_ofertas && <span className="ml-2 text-xs text-neutral-500">Sem ofertas</span>}</td>
                    <td className="p-3">{c.telefone}</td><td className="p-3">{c.total_pedidos}</td>
                    <td className="p-3">{brl(Number(c.total_gasto))}</td><td className="p-3">{dataCurta(c.ultimo_pedido)}</td>
                  </tr>
                ))}
                {!visiveis.length && <tr><td colSpan={5} className="p-8 text-center text-neutral-500">{carregando ? "Carregando clientes…" : "Nenhum cliente encontrado."}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {selecionado && (
        <Drawer titulo={selecionado.nome || selecionado.telefone} fechar={() => setSelecionado(null)}
          rodape={<div className="flex gap-2">
            {linkWhatsApp(selecionado.telefone) && <a href={linkWhatsApp(selecionado.telefone)!} target="_blank" rel="noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 font-semibold text-white">
              <MessageCircle className="size-4" /> WhatsApp</a>}
            <button onClick={() => { setSelecionado(null); setAba("recuperador"); }}
              className="h-11 rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700">Ofertas</button>
          </div>}>
          <div className="space-y-5 p-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-neutral-500">Pedidos</dt><dd className="font-semibold">{selecionado.total_pedidos}</dd></div>
              <div><dt className="text-neutral-500">Total gasto</dt><dd className="font-semibold">{brl(Number(selecionado.total_gasto))}</dd></div>
              <div><dt className="text-neutral-500">Primeiro pedido</dt><dd>{dataCurta(selecionado.primeiro_pedido)}</dd></div>
              <div><dt className="text-neutral-500">Último pedido</dt><dd>{dataCurta(selecionado.ultimo_pedido)}</dd></div>
              {selecionado.endereco && <div className="col-span-2"><dt className="text-neutral-500">Endereço salvo</dt><dd>{selecionado.endereco}</dd></div>}
            </dl>
            <section>
              <h3 className="mb-2 font-semibold">Histórico de pedidos</h3>
              {historicoCarregado && !pedidos.length ? <p className="text-sm text-neutral-500">Nenhum pedido encontrado.</p> : !historicoCarregado ? <p className="text-sm text-neutral-500">Carregando histórico…</p> : (
                <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {pedidos.map((p) => <li key={p.id} className="py-3">
                    <div className="flex justify-between gap-3"><b>Pedido #{p.numero}</b><b>{brl(Number(p.total))}</b></div>
                    <p className="text-xs text-neutral-500">{dataHora(p.created_at)} · {p.tipo} · {p.status}</p>
                    {p.desconto > 0 && <p className="text-xs text-emerald-700">Desconto {brl(Number(p.desconto))}{p.cupom?.codigo ? ` · ${p.cupom.codigo}` : ""}</p>}
                  </li>)}
                </ul>
              )}
            </section>
          </div>
        </Drawer>
      )}
    </div>
  );
}
