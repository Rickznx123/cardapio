import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { abertoAgora, temHorarios } from "@/lib/horarios";
import { createAdminClient } from "@/lib/supabase/server";
import { decidir } from "@/lib/whatsapp/decidir";
import { baixarMidia, numeroConectado } from "@/lib/whatsapp/evolution";
import { preencher, variaveisEmpresa } from "@/lib/whatsapp/mensagens";
import { CAMPOS_EMPRESA, enviar, foiDoBot, iaDisponivel, primeiraVez, responderIA, secretOk, textoAtivo, transcrever } from "@/lib/whatsapp/servidor";

type Key = { id: string; remoteJid: string; fromMe: boolean; remoteJidAlt?: string; senderPn?: string };
type Msg = {
  key: Key; pushName?: string; messageTimestamp?: number | string;
  message?: {
    conversation?: string; extendedTextMessage?: { text?: string }; imageMessage?: { caption?: string };
    audioMessage?: { mimetype?: string };
  };
};
type Conexao = { empresa_id: string; instancia: string };

// Evolution API → aqui (configurado na criação da instância). Responde 200 na hora; o trabalho roda no after().
export async function POST(request: Request) {
  if (!secretOk(request)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const corpo = await request.json().catch(() => null);
  if (!corpo?.instance) return NextResponse.json({ ok: true });
  const origem = new URL(request.url).origin;
  // Roda depois da resposta: erro aqui não chega ao onRequestError, por isso o captureException.
  after(() => processar(corpo, origem).catch((e) => {
    console.error("whatsapp webhook:", e);
    Sentry.captureException(e, { tags: { rota: "whatsapp-webhook" } });
  }));
  return NextResponse.json({ ok: true });
}

async function processar(corpo: { event?: string; instance: string; data?: unknown }, origem: string) {
  const admin = createAdminClient();
  const { data: conexao } = await admin.from("whatsapp_conexoes").select("empresa_id, instancia")
    .eq("instancia", corpo.instance).maybeSingle();
  if (!conexao) return;
  const evento = String(corpo.event ?? "").toLowerCase().replace(/_/g, ".");

  if (evento === "connection.update") {
    const state = (corpo.data as { state?: string })?.state;
    if (state === "open") {
      await admin.from("whatsapp_conexoes").update({
        status: "conectado", conectado_em: new Date().toISOString(), numero: await numeroConectado(conexao.instancia),
      }).eq("empresa_id", conexao.empresa_id);
    } else if (state === "close") {
      await admin.from("whatsapp_conexoes").update({ status: "desconectado" })
        .eq("empresa_id", conexao.empresa_id).eq("status", "conectado");
    }
    return;
  }
  if (evento !== "messages.upsert") return;
  for (const m of [corpo.data].flat() as Msg[]) {
    if (m?.key?.id) await mensagem(admin, conexao, m, origem);
  }
}

async function mensagem(admin: SupabaseClient, conexao: Conexao, m: Msg, origem: string) {
  const jid = m.key.remoteJid ?? "";
  if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return;
  // Mensagens antigas (sincronização ao conectar, reentrega atrasada): ignora.
  if (Number(m.messageTimestamp) && Number(m.messageTimestamp) < Date.now() / 1000 - 300) return;
  if (!(await primeiraVez(admin, `msg:${m.key.id}`))) return;

  // Contato com endereçamento @lid: usa o número real quando a Evolution manda; senão responde ao próprio JID.
  const contato = jid.endsWith("@lid") ? (m.key.remoteJidAlt ?? m.key.senderPn ?? jid) : jid;
  const telefone = contato.endsWith("@s.whatsapp.net") ? contato.split("@")[0] : contato;
  const empresaId = conexao.empresa_id;
  const agora = new Date();

  const [{ data: cfgRow }, { data: conversa }] = await Promise.all([
    admin.from("bot_config").select("*").eq("empresa_id", empresaId).maybeSingle(),
    admin.from("bot_conversas").select("ultima_saudacao, pausado_ate").eq("empresa_id", empresaId).eq("telefone", telefone).maybeSingle(),
  ]);
  const cfg = cfgRow ?? { ia_ativa: false, pausa_humano_minutos: 30, intervalo_saudacao_horas: 12 };
  const salvarConversa = (campos: object) =>
    admin.from("bot_conversas").upsert({ empresa_id: empresaId, telefone, ...campos }, { onConflict: "empresa_id,telefone" });

  // Atendente respondeu pelo celular: o bot fica quieto com esse contato por um tempo.
  if (m.key.fromMe) {
    // O eco do que o próprio bot enviou pode chegar antes de o envio gravar o id: espera um pouco e confere.
    await new Promise((r) => setTimeout(r, 3000));
    if (await foiDoBot(admin, m.key.id)) return;
    await salvarConversa({ pausado_ate: new Date(agora.getTime() + cfg.pausa_humano_minutos * 60_000).toISOString() });
    return;
  }

  const { data: empresa } = await admin.from("empresas").select(CAMPOS_EMPRESA).eq("id", empresaId).single();
  // Empresa desativada ou teste vencido: bot fica quieto.
  if (!empresa || !(await admin.rpc("empresa_liberada", { p_empresa: empresaId })).data) return;

  const iaAtiva = cfg.ia_ativa && iaDisponivel(); // toggle ligado e chave configurada
  const audio = !!m.message?.audioMessage;
  let texto = m.message?.conversation ?? m.message?.extendedTextMessage?.text ?? m.message?.imageMessage?.caption ?? "";
  if (!texto && audio && iaAtiva) {
    const midia = await baixarMidia(conexao.instancia, m.key);
    if (midia.base64) texto = await transcrever(midia.base64, midia.mimetype ?? m.message?.audioMessage?.mimetype);
  }

  const saudouEm = conversa?.ultima_saudacao ? Date.parse(conversa.ultima_saudacao) : 0;
  const situacao = {
    pausado: !!conversa?.pausado_ate && Date.parse(conversa.pausado_ate) > agora.getTime(),
    // Loja aberta no botão e, se houver horários cadastrados, dentro de um turno (inclui a madrugada de ontem).
    aberto: empresa.aberto && (!temHorarios(empresa.horarios) || abertoAgora(empresa.horarios, agora)),
    saudouRecente: agora.getTime() - saudouEm < cfg.intervalo_saudacao_horas * 3_600_000,
    texto,
    iaAtiva,
    audio,
  };
  let decisao = decidir(situacao);
  let resposta: string | undefined;
  if (decisao && decisao !== "ia") {
    resposta = await textoAtivo(admin, empresaId, decisao.tipo);
    // Boas-vindas desligada: segue para o menu/IA como se já tivesse saudado.
    if (!resposta && decisao.tipo === "boas_vindas") {
      decisao = decidir({ ...situacao, saudouRecente: true });
      if (decisao && decisao !== "ia") resposta = await textoAtivo(admin, empresaId, decisao.tipo);
    }
  }
  const vars = { ...variaveisEmpresa(empresa, origem), cliente: m.pushName ?? "" };
  if (decisao === "ia") resposta = await responderIA(admin, empresa, vars.horarios!, vars.link_cardapio!, texto);
  else if (resposta) resposta = preencher(resposta, vars);

  if (resposta) await enviar(admin, conexao.instancia, telefone, resposta);
  const saudou = !!resposta && decisao !== null && decisao !== "ia" && decisao.saudacao;
  await salvarConversa({ ultimo_contato: agora.toISOString(), ...(saudou ? { ultima_saudacao: agora.toISOString() } : {}) });
}
