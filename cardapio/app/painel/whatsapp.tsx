"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Save, Send, Smartphone, Unplug } from "lucide-react";
import { toast } from "@/components/toast";
import { mascaraTelefone } from "@/lib/telefone";
import { brl } from "@/lib/tipos";
import { preencher, TIPOS, type TipoMensagem, VARIAVEIS, type Variaveis, variaveisEmpresa } from "@/lib/whatsapp/mensagens";
import type { Empresa } from "./configuracoes";
import { botao, botaoSec, Campo, card, input, inputNum, ok, rotulo, supabase } from "./ui";

type Conexao = {
  status: "desconectado" | "aguardando_qr" | "conectado" | null; numero?: string | null; qr?: string | null;
  configurando?: boolean; // EVOLUTION_API_URL ainda não configurada no server
};
type Mensagem = { tipo: TipoMensagem; texto: string; ativo: boolean };
type Config = { ia_ativa: boolean; pausa_humano_minutos: number; intervalo_saudacao_horas: number };

const EMOJIS = ["👋", "😀", "😋", "🙏", "❤️", "✅", "🔥", "🕒", "🛵", "🛍️", "🍔", "🍕", "🥤", "👨‍🍳", "📍", "💳"];

async function chamar(metodo: "GET" | "POST" | "DELETE", empresaId: string): Promise<Conexao> {
  const r = await fetch(`/api/whatsapp/conexao${metodo === "POST" ? "" : `?empresa_id=${empresaId}`}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: metodo === "POST" ? JSON.stringify({ empresa_id: empresaId }) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? "Erro ao falar com o servidor");
  return j;
}

// WhatsApp: conexão (QR), chatbot (mensagens, IA, pausa) e teste de envio.
export function WhatsApp({ empresa }: { empresa: Empresa }) {
  const [conexao, setConexao] = useState<Conexao>();
  const [ocupado, setOcupado] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const aguardando = conexao?.status === "aguardando_qr";
  const temConexao = !!conexao?.status;

  useEffect(() => {
    chamar("GET", empresa.id).then(setConexao).catch((e) => { toast.erro(e.message); setConexao({ status: null }); });
  }, [empresa.id]);

  // QR expira: pede status + QR novo a cada 20s até conectar.
  useEffect(() => {
    if (!aguardando) return;
    const t = setInterval(() => chamar("GET", empresa.id).then(setConexao).catch(() => {}), 20_000);
    return () => clearInterval(t);
  }, [aguardando, empresa.id]);

  // Mensagens e config são criadas (com os padrões) ao conectar pela primeira vez.
  useEffect(() => {
    if (!temConexao) return;
    supabase.from("bot_mensagens").select("tipo, texto, ativo").eq("empresa_id", empresa.id)
      .then(({ data, error }) => (error ? toast.erro(error.message) : setMensagens(data as Mensagem[])));
    supabase.from("bot_config").select("ia_ativa, pausa_humano_minutos, intervalo_saudacao_horas").eq("empresa_id", empresa.id).maybeSingle()
      .then(({ data, error }) => (error ? toast.erro(error.message) : setConfig(data)));
  }, [temConexao, empresa.id]);

  async function acao(metodo: "POST" | "DELETE") {
    if (metodo === "DELETE" && !confirm("Desconectar o WhatsApp? O chatbot e os avisos de pedido param até conectar de novo.")) return;
    setOcupado(true);
    try {
      setConexao(await chamar(metodo, empresa.id));
    } catch (e) {
      toast.erro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function salvarConfig(campos: Partial<Config>) {
    if (await ok(supabase.from("bot_config").update(campos).eq("empresa_id", empresa.id), "Salvo")) {
      setConfig((c) => c && { ...c, ...campos });
    }
  }

  if (conexao === undefined) return <p>Carregando…</p>;
  if (conexao.configurando) {
    return (
      <section className={`${card} flex items-center gap-3`}>
        <Smartphone className="size-6 shrink-0 text-neutral-500" />
        <div>
          <h2 className="text-lg font-semibold">WhatsApp em configuração</h2>
          <p className="text-sm text-neutral-500">A integração ainda está sendo preparada. Em breve você poderá conectar o número da loja aqui.</p>
        </div>
      </section>
    );
  }
  const status = conexao.status ?? "desconectado";

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <Smartphone className="size-6 text-neutral-500" />
          <div className="mr-auto">
            <h2 className="text-lg font-semibold">Conexão</h2>
            <p className="text-sm text-neutral-500">
              {status === "conectado" ? `Conectado${conexao.numero ? ` ao número +${conexao.numero}` : ""}`
                : status === "aguardando_qr" ? "Aguardando leitura do QR Code" : "Desconectado"}
            </p>
          </div>
          <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
            status === "conectado" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : status === "aguardando_qr" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>
            <span className={`size-2 rounded-full ${status === "conectado" ? "bg-emerald-500" : status === "aguardando_qr" ? "animate-pulse bg-amber-500" : "bg-neutral-400"}`} />
            {status === "conectado" ? "Conectado" : status === "aguardando_qr" ? "Aguardando" : "Desconectado"}
          </span>
        </div>

        {aguardando && (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {conexao.qr
              ? <img src={conexao.qr} alt="QR Code para conectar o WhatsApp" className="size-56 rounded-xl border border-neutral-200 bg-white p-2" />
              : <div className="flex size-56 items-center justify-center rounded-xl bg-neutral-100 text-sm text-neutral-500 dark:bg-neutral-800">Gerando QR…</div>}
            <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-300">
              <li>Abra o WhatsApp no celular da loja.</li>
              <li>Toque em <b>Mais opções ⋮</b> ou <b>Configurações</b> ▸ <b>Aparelhos conectados</b>.</li>
              <li>Toque em <b>Conectar um aparelho</b> e aponte para o QR Code.</li>
              <li className="text-neutral-500">O código é renovado a cada 20 segundos.</li>
            </ol>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {status !== "conectado" && (
            <button disabled={ocupado} onClick={() => acao("POST")} className={botao}>
              <Smartphone className="size-4" /> {ocupado ? "Gerando…" : aguardando ? "Gerar novo QR" : "Conectar WhatsApp"}
            </button>
          )}
          {status !== "desconectado" && (
            <button disabled={ocupado} onClick={() => acao("DELETE")} className={botaoSec}>
              <Unplug className="size-4" /> {aguardando ? "Cancelar" : "Desconectar"}
            </button>
          )}
        </div>
      </section>

      {temConexao && config && (
        <>
          <section className={`${card} flex items-start gap-4`}>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
              <Bot className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Ative o Chatbot IA</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Quando o cliente escreve algo que não é uma opção do menu (ex.: &quot;tem pizza de calabresa?&quot;, &quot;entrega no Centro?&quot;),
                a IA responde usando seu cardápio, preços, horários, bairros e formas de pagamento. Ela entende áudio, não inventa
                itens nem preços e não fecha pedidos: sempre manda o link do cardápio.
              </p>
            </div>
            <button role="switch" aria-checked={config.ia_ativa} aria-label="Chatbot IA" onClick={() => salvarConfig({ ia_ativa: !config.ia_ativa })}
              className={`flex h-7 w-12 shrink-0 items-center rounded-full p-1 ${config.ia_ativa ? "justify-end bg-emerald-600" : "justify-start bg-neutral-300 dark:bg-neutral-700"}`}>
              <span className="size-5 rounded-full bg-white shadow" />
            </button>
          </section>

          <section className={`${card} grid gap-4 sm:grid-cols-2`}>
            <label className="block">
              <span className={rotulo}>Pausa quando um atendente responde (min)</span>
              <Campo type="number" min={0} max={1440} valor={config.pausa_humano_minutos} className={inputNum}
                salvar={(v) => salvarConfig({ pausa_humano_minutos: Math.max(0, Math.round(Number(v))) })} />
              <span className="mt-1 block text-xs text-neutral-500">Se você responder pelo celular, o bot fica quieto com esse cliente por esse tempo.</span>
            </label>
            <label className="block">
              <span className={rotulo}>Repetir boas-vindas depois de (horas)</span>
              <Campo type="number" min={0} max={720} valor={config.intervalo_saudacao_horas} className={inputNum}
                salvar={(v) => salvarConfig({ intervalo_saudacao_horas: Math.max(0, Math.round(Number(v))) })} />
              <span className="mt-1 block text-xs text-neutral-500">Tempo sem conversa para o cliente receber a saudação de novo.</span>
            </label>
          </section>

          {mensagens.length > 0 && (
            <Mensagens empresa={empresa} mensagens={mensagens} mudou={setMensagens} conectado={status === "conectado"} />
          )}
        </>
      )}
    </div>
  );
}

// *negrito* do WhatsApp na pré-visualização.
const negrito = (t: string) =>
  t.split(/(\*[^*\n]+\*)/g).map((p, i) => (/^\*[^*\n]+\*$/.test(p) ? <b key={i}>{p.slice(1, -1)}</b> : p));

function Mensagens({ empresa, mensagens, mudou, conectado }: {
  empresa: Empresa; mensagens: Mensagem[]; mudou: (m: Mensagem[]) => void; conectado: boolean;
}) {
  const [sel, setSel] = useState<TipoMensagem>("boas_vindas");
  const atual = mensagens.find((m) => m.tipo === sel);
  const [rascunho, setRascunho] = useState(atual?.texto ?? "");
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const alterado = rascunho !== (atual?.texto ?? "");

  const origem = window.location.origin;
  const exemplo: Variaveis = {
    ...variaveisEmpresa(empresa, origem),
    cliente: "Maria", numero_pedido: "123", total: brl(57.9), link_pedido: `${origem}/${empresa.slug}/pedido/exemplo`,
  };
  const ordem = (Object.keys(TIPOS) as TipoMensagem[]).filter((t) => mensagens.some((m) => m.tipo === t));
  const gravar = (tipo: TipoMensagem, campos: Partial<Mensagem>) =>
    supabase.from("bot_mensagens").update(campos).eq("empresa_id", empresa.id).eq("tipo", tipo);

  function escolher(t: TipoMensagem) {
    if (alterado && !confirm("Descartar as alterações não salvas desta mensagem?")) return;
    setSel(t);
    setRascunho(mensagens.find((m) => m.tipo === t)?.texto ?? "");
  }

  async function alternar(m: Mensagem) {
    const lista = mensagens.map((x) => (x.tipo === m.tipo ? { ...x, ativo: !m.ativo } : x));
    mudou(lista);
    if (!(await ok(gravar(m.tipo, { ativo: !m.ativo }), m.ativo ? "Mensagem desativada" : "Mensagem ativada"))) mudou(mensagens);
  }

  async function salvar() {
    if (!rascunho.trim()) return toast.erro("A mensagem não pode ficar vazia");
    if (await ok(gravar(sel, { texto: rascunho }), "Mensagem salva")) {
      mudou(mensagens.map((m) => (m.tipo === sel ? { ...m, texto: rascunho } : m)));
    }
  }

  function inserir(s: string) {
    const el = ref.current!;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    setRascunho(rascunho.slice(0, a) + s + rascunho.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + s.length, a + s.length); });
  }

  async function testar() {
    setEnviando(true);
    const r = await fetch("/api/whatsapp/teste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: empresa.id, telefone, texto: preencher(rascunho, exemplo) }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) toast.ok("Mensagem de teste enviada");
    else toast.erro(j.erro ?? "Falha ao enviar");
    setEnviando(false);
  }

  return (
    <section className={`${card} grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_16rem]`}>
      <div>
        <h2 className="mb-2 text-lg font-semibold">Mensagens</h2>
        <ul className="flex flex-col gap-0.5">
          {ordem.map((t) => {
            const m = mensagens.find((x) => x.tipo === t)!;
            return (
              <li key={t} className={`flex items-center gap-2 rounded-lg pr-2 ${t === sel ? "bg-rose-50 dark:bg-rose-950" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
                <button onClick={() => escolher(t)} aria-current={t === sel ? "true" : undefined}
                  className={`min-h-10 min-w-0 flex-1 truncate px-3 text-left text-sm ${t === sel ? "font-semibold text-rose-700 dark:text-rose-300" : ""} ${m.ativo ? "" : "text-neutral-400 line-through"}`}>
                  {TIPOS[t].nome}
                </button>
                <input type="checkbox" checked={m.ativo} onChange={() => alternar(m)} aria-label={`${TIPOS[t].nome}: ativa`}
                  className="size-5 shrink-0 accent-rose-600" />
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className={rotulo}>{TIPOS[sel].nome}</span>
          <textarea ref={ref} value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={9} maxLength={4000}
            className={`${input} h-auto py-2`} />
        </label>
        <div>
          <p className="mb-1 text-xs font-medium text-neutral-500">Inserir variável</p>
          <div className="flex flex-wrap gap-1.5">
            {VARIAVEIS.map((v) => (
              <button key={v} type="button" onClick={() => inserir(`{${v}}`)}
                className="h-8 rounded-md border border-neutral-300 px-2 font-mono text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
                {`{${v}}`}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-neutral-500">Emoji</p>
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => inserir(e)} aria-label={`Inserir ${e}`}
                className="size-9 rounded-md text-lg hover:bg-neutral-100 dark:hover:bg-neutral-800">{e}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!alterado} onClick={salvar} className={botao}><Save className="size-4" /> Salvar</button>
          <button onClick={() => setRascunho(TIPOS[sel].padrao)} className={botaoSec}><RotateCcw className="size-4" /> Restaurar padrão</button>
        </div>
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className={rotulo}>Enviar mensagem de teste</p>
          <div className="flex gap-2">
            <input value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} inputMode="tel"
              placeholder="(66) 99999-9999" aria-label="Número para o teste" className={input} />
            <button disabled={!conectado || enviando || telefone.replace(/\D/g, "").length < 10} onClick={testar} className={botaoSec}>
              <Send className="size-4" /> {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
          {!conectado && <p className="mt-1 text-xs text-neutral-500">Conecte o WhatsApp para enviar testes.</p>}
        </div>
      </div>

      <div aria-label="Pré-visualização" className="mx-auto w-full max-w-64 overflow-hidden rounded-[2rem] border-8 border-neutral-900 bg-[#efeae2] dark:bg-[#0b141a]">
        <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2 text-white">
          <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-xs font-bold">{empresa.nome[0]}</span>
          <span className="truncate text-sm font-semibold">{empresa.nome}</span>
        </div>
        <div className="min-h-80 p-3">
          <div className="max-w-[90%] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 text-[13px] leading-snug wrap-break-word whitespace-pre-wrap text-neutral-900 shadow-sm dark:bg-[#202c33] dark:text-neutral-100">
            {negrito(preencher(rascunho, exemplo))}
            <span className="mt-0.5 block text-right text-[10px] text-neutral-400">12:00</span>
          </div>
        </div>
      </div>
    </section>
  );
}
