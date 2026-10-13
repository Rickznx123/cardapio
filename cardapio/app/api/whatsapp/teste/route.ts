import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { numeroWhats } from "@/lib/telefone";
import { enviar, eDono } from "@/lib/whatsapp/servidor";

const erro = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });

// Dono manda uma mensagem de teste (o texto já vem preenchido com valores de exemplo pelo painel).
export async function POST(request: Request) {
  const { empresa_id, telefone, texto } = await request.json().catch(() => ({}));
  if (!(await eDono(empresa_id))) return erro("Sem permissão", 403);
  const numero = numeroWhats(typeof telefone === "string" ? telefone : null);
  if (!numero) return erro("Informe um número com DDD", 400);
  if (typeof texto !== "string" || !texto.trim() || texto.length > 4000) return erro("Mensagem inválida", 400);

  const admin = createAdminClient();
  const { data: c } = await admin.from("whatsapp_conexoes").select("instancia")
    .eq("empresa_id", empresa_id).eq("status", "conectado").maybeSingle();
  if (!c) return erro("Conecte o WhatsApp primeiro", 409);
  try {
    await enviar(admin, c.instancia, numero, texto);
  } catch (e) {
    return erro(`Falha ao enviar: ${(e as Error).message}`, 502);
  }
  return NextResponse.json({ ok: true });
}
