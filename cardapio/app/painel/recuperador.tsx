"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/toast";
import { brl } from "@/lib/tipos";
import { CONFIG_RECUPERADOR_PADRAO, FIM_OFERTA, montarMensagem, textoOferta, type ConfigRecuperador, type Oferta } from "@/lib/recuperador";
import { input, rotulo, supabase } from "./ui";

type Envio = {
  id: string; enviado_em: string; status: "pendente" | "enviado" | "falhou";
  convertido_pedido_id: string | null; erro: string | null;
  pedido: { aceite_pendente: boolean } | null;
  cliente: { nome: string | null; telefone: string } | null; cupom: { codigo: string } | null;
};
type Metricas = { enviados: number; convertidos: number; faturamento: number };
type Campos = Omit<ConfigRecuperador, "empresa_id">;

export function Recuperador({ empresaId, empresaNome }: { empresaId: string; empresaNome: string }) {
  const [config, setConfig] = useState<Campos>({ ...CONFIG_RECUPERADOR_PADRAO });
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [metricas, setMetricas] = useState<Metricas>({ enviados: 0, convertidos: 0, faturamento: 0 });
  const [agora] = useState(() => Date.now());

  useEffect(() => {
    let ativo = true;
    Promise.all([
      supabase.from("recuperador_config").select("*").eq("empresa_id", empresaId).maybeSingle(),
      supabase.rpc("recuperador_metricas", { p_empresa_id: empresaId, p_dias: 30 }),
      supabase.from("recuperador_envios")
        .select("id,enviado_em,status,convertido_pedido_id,erro,pedido:pedidos!recuperador_envios_convertido_pedido_id_fkey(aceite_pendente),cliente:clientes(nome,telefone),cupom:cupons(codigo)")
        .eq("empresa_id", empresaId).order("enviado_em", { ascending: false }).limit(30),
    ]).then(([c, m, e]) => {
      if (!ativo) return;
      if (c.error) toast.erro(c.error.message);
      else if (c.data) setConfig({ ...CONFIG_RECUPERADOR_PADRAO, ...c.data, mensagem: c.data.mensagem ?? CONFIG_RECUPERADOR_PADRAO.mensagem });
      if (m.error) toast.erro(m.error.message);
      else if (m.data) setMetricas(m.data as Metricas);
      if (e.error) toast.erro(e.error.message);
      else setEnvios((e.data ?? []) as unknown as Envio[]);
      setCarregado(true);
    });
    return () => { ativo = false; };
  }, [empresaId]);

  function alterar<K extends keyof Campos>(chave: K, valor: Campos[K]) {
    setConfig((c) => ({ ...c, [chave]: valor }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const { error } = await supabase.from("recuperador_config").upsert({ empresa_id: empresaId, ...config }, { onConflict: "empresa_id" });
    setSalvando(false);
    if (error) return toast.erro(error.message);
    toast.ok("Configuração do recuperador salva");
  }

  const preview = montarMensagem(config.mensagem || CONFIG_RECUPERADOR_PADRAO.mensagem, {
    cliente: "Mariana", empresa: empresaNome, oferta: textoOferta(config.tipo_oferta, config.valor_oferta),
    cupom: "VOLTA1A2B3", validade: new Date(agora + config.validade_dias * 86_400_000).toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" }),
    link_cardapio: "https://exemplo.com/cardapio",
  });
  const campoNum = (chave: "dias_sem_comprar" | "valor_oferta" | "pedido_minimo" | "validade_dias" | "intervalo_dias" | "limite_dia", titulo: string, min: number, max: number, step = "1") => (
    <label><span className={rotulo}>{titulo}</span><input type="number" min={min} max={max} step={step} required value={config[chave]}
      onChange={(e) => alterar(chave, Number(e.target.value))} className={input} /></label>
  );
  const taxa = metricas.enviados ? Math.round(metricas.convertidos / metricas.enviados * 100) : 0;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Enviados (30 dias)", metricas.enviados], ["Cupons usados", metricas.convertidos],
          ["Conversão", `${taxa}%`], ["Faturamento recuperado", brl(Number(metricas.faturamento))],
        ].map(([nome, valor]) => <div key={nome} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500">{nome}</p><p className="mt-1 text-xl font-bold">{valor}</p>
        </div>)}
      </section>
      <form onSubmit={salvar} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="flex items-center gap-3 font-semibold">
          <input type="checkbox" checked={config.ativo} onChange={(e) => alterar("ativo", e.target.checked)} className="size-5 accent-rose-600" />
          Ativar recuperação automática de clientes
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campoNum("dias_sem_comprar", "Dias sem comprar", 1, 365)}
          <label><span className={rotulo}>Tipo de oferta</span><select value={config.tipo_oferta}
            onChange={(e) => alterar("tipo_oferta", e.target.value as Oferta)} className={input}>
            <option value="percentual">Percentual</option><option value="valor">Valor em reais</option><option value="frete_gratis">Frete grátis</option>
          </select></label>
          {config.tipo_oferta !== "frete_gratis" && campoNum("valor_oferta", config.tipo_oferta === "percentual" ? "Desconto (%)" : "Desconto (R$)", 0, config.tipo_oferta === "percentual" ? 100 : 10000, "0.01")}
          {campoNum("pedido_minimo", "Pedido mínimo (R$)", 0, 100000, "0.01")}
          {campoNum("validade_dias", "Validade do cupom (dias)", 1, 90)}
          {campoNum("intervalo_dias", "Intervalo entre ofertas (dias)", 1, 365)}
          {campoNum("limite_dia", "Limite de envios por dia", 1, 200)}
          <label><span className={rotulo}>Início da janela (Cuiabá)</span><input type="time" required value={config.janela_inicio}
            onChange={(e) => alterar("janela_inicio", e.target.value)} className={input} /></label>
          <label><span className={rotulo}>Fim da janela (Cuiabá)</span><input type="time" required value={config.janela_fim}
            onChange={(e) => alterar("janela_fim", e.target.value)} className={input} /></label>
        </div>
        <label className="block"><span className={rotulo}>Mensagem</span>
          <textarea rows={5} maxLength={2000} value={config.mensagem ?? ""}
            onChange={(e) => alterar("mensagem", e.target.value)} className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
          <span className="mt-1 block text-xs text-neutral-500">Variáveis: {"{cliente}"} {"{empresa}"} {"{oferta}"} {"{cupom}"} {"{validade}"} {"{link_cardapio}"}.</span>
          <span className="block text-xs text-neutral-500">A frase “{FIM_OFERTA}” será sempre acrescentada ao final.</span>
        </label>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <button disabled={salvando || !carregado} className="h-11 rounded-lg bg-rose-600 px-4 font-semibold text-white disabled:opacity-50">
            {salvando ? "Salvando…" : "Salvar configuração"}
          </button>
          <div className="w-full max-w-xs rounded-[2rem] border-4 border-neutral-800 bg-neutral-100 p-3 shadow-inner">
            <div className="mb-2 text-center text-xs font-semibold text-neutral-500">Prévia no WhatsApp</div>
            <p className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-white p-3 text-sm shadow-sm">{preview}</p>
          </div>
        </div>
      </form>
      <section>
        <h3 className="mb-2 font-semibold">Últimos envios</h3>
        {!envios.length ? <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">Nenhum envio registrado.</p> : (
          <ul className="space-y-2">
            {envios.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <div className="min-w-0 flex-1"><b>{e.cliente?.nome || e.cliente?.telefone || "Cliente"}</b>
                <p className="text-xs text-neutral-500">{new Date(e.enviado_em).toLocaleString("pt-BR")} · Cupom {e.cupom?.codigo ?? "—"}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${e.status === "enviado" ? "bg-emerald-100 text-emerald-800" : e.status === "falhou" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                {e.status === "enviado" ? "Enviado" : e.status === "falhou" ? "Falhou" : "Pendente"}
              </span>
              {e.convertido_pedido_id && (
                <span className={`text-xs font-semibold ${e.pedido?.aceite_pendente ? "text-amber-700" : "text-emerald-700"}`}>
                  {e.pedido?.aceite_pendente ? "Aguardando aceite" : "Convertido"}
                </span>
              )}
              {e.erro && <span title={e.erro} className="w-full truncate text-xs text-red-700">{e.erro}</span>}
            </li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
