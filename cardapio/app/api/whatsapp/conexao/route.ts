import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { criarInstancia, desconectar, estado, nomeInstancia, numeroConectado, obterQr } from "@/lib/whatsapp/evolution";
import { TIPOS } from "@/lib/whatsapp/mensagens";
import { eDono, iaDisponivel } from "@/lib/whatsapp/servidor";

const erro = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });
const empresaDaUrl = (request: Request) => new URL(request.url).searchParams.get("empresa_id");

// Conectar: cria a conexão (com mensagens padrão e config do bot) e a instância na Evolution. Devolve o QR.
export async function POST(request: Request) {
  const { empresa_id } = await request.json().catch(() => ({}));
  if (!(await eDono(empresa_id))) return erro("Sem permissão", 403);
  const admin = createAdminClient();
  const instancia = nomeInstancia(empresa_id);

  const semDuplicar = { ignoreDuplicates: true } as const;
  const seeds = await Promise.all([
    admin.from("whatsapp_conexoes").upsert({ empresa_id, instancia, status: "aguardando_qr" }, { onConflict: "empresa_id" }),
    admin.from("bot_mensagens").upsert(
      Object.entries(TIPOS).map(([tipo, t]) => ({ empresa_id, tipo, texto: t.padrao })),
      { onConflict: "empresa_id,tipo", ...semDuplicar },
    ),
    admin.from("bot_config").upsert({ empresa_id }, { onConflict: "empresa_id", ...semDuplicar }),
  ]);
  const falha = seeds.find((r) => r.error);
  if (falha) return erro(falha.error!.message, 400);

  const webhook = `${new URL(request.url).origin}/api/whatsapp/webhook?secret=${encodeURIComponent(process.env.WHATSAPP_WEBHOOK_SECRET ?? "")}`;
  try {
    // Já existe na Evolution (ex.: conexão anterior sem desconectar)? Só pede um QR novo.
    const qr = await criarInstancia(instancia, webhook).catch(() => obterQr(instancia));
    return NextResponse.json({ status: "aguardando_qr", qr });
  } catch (e) {
    Sentry.captureException(e, { tags: { rota: "whatsapp-conexao" } }); // Evolution fora do ar / chave errada
    await admin.from("whatsapp_conexoes").update({ status: "desconectado" }).eq("empresa_id", empresa_id);
    return erro(`Não foi possível falar com o servidor do WhatsApp. ${(e as Error).message}`, 502);
  }
}

// Status atual (o painel chama a cada 20s enquanto espera o QR ser lido; cada chamada traz um QR novo).
export async function GET(request: Request) {
  const empresa_id = empresaDaUrl(request);
  if (!(await eDono(empresa_id))) return erro("Sem permissão", 403);
  if (!process.env.EVOLUTION_API_URL) return NextResponse.json({ status: null, configurando: true });
  const json = (corpo: object) => NextResponse.json({ ...corpo, ia_disponivel: iaDisponivel() });
  const admin = createAdminClient();
  const { data: c } = await admin.from("whatsapp_conexoes").select("*").eq("empresa_id", empresa_id!).maybeSingle();
  if (!c) return json({ status: null });

  if ((await estado(c.instancia)) === "open") {
    if (c.status !== "conectado" || !c.numero) {
      c.numero = await numeroConectado(c.instancia);
      await admin.from("whatsapp_conexoes").update({ status: "conectado", numero: c.numero, conectado_em: new Date().toISOString() })
        .eq("empresa_id", empresa_id!);
    }
    return json({ status: "conectado", numero: c.numero });
  }
  if (c.status === "aguardando_qr") {
    return json({ status: "aguardando_qr", qr: await obterQr(c.instancia).catch(() => null) });
  }
  if (c.status === "conectado") await admin.from("whatsapp_conexoes").update({ status: "desconectado" }).eq("empresa_id", empresa_id!);
  return json({ status: "desconectado" });
}

export async function DELETE(request: Request) {
  const empresa_id = empresaDaUrl(request);
  if (!(await eDono(empresa_id))) return erro("Sem permissão", 403);
  await desconectar(nomeInstancia(empresa_id!));
  const { error } = await createAdminClient().from("whatsapp_conexoes")
    .update({ status: "desconectado", numero: null, conectado_em: null }).eq("empresa_id", empresa_id!);
  if (error) return erro(error.message, 400);
  return NextResponse.json({ status: "desconectado" });
}
