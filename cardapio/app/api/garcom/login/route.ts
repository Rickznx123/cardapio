import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60_000;
// shortcut: contador em memória vale por instância (serverless reinicia/escala); mover p/ tabela ou Upstash se houver abuso.
const falhas = new Map<string, { n: number; ate: number }>();

const negado = () => NextResponse.json({ erro: "PIN inválido" }, { status: 401 });

// Garçom escolhe o nome (membro_id) e digita o PIN. O e-mail fica só no servidor.
export async function POST(request: Request) {
  const { membro_id, pin } = await request.json().catch(() => ({}));
  if (typeof membro_id !== "string" || !/^\d{6}$/.test(String(pin))) return negado();

  const f = falhas.get(membro_id);
  if (f && f.n >= MAX_FALHAS && f.ate > Date.now()) {
    return NextResponse.json({ erro: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
  }

  const admin = createAdminClient();
  const { data: membro } = await admin
    .from("membros")
    .select("user_id, empresas!inner(ativo)")
    .eq("id", membro_id)
    .eq("papel", "garcom")
    .eq("ativo", true)
    .eq("empresas.ativo", true)
    .maybeSingle();
  if (!membro) return negado();

  const { data: u } = await admin.auth.admin.getUserById(membro.user_id);
  if (!u.user?.email) return negado();

  const supabase = await createClient(); // grava os cookies de sessão na resposta
  const { error } = await supabase.auth.signInWithPassword({ email: u.user.email, password: String(pin) });
  if (error) {
    const n = f && f.ate > Date.now() ? f.n + 1 : 1;
    falhas.set(membro_id, { n, ate: Date.now() + BLOQUEIO_MS });
    return negado();
  }
  falhas.delete(membro_id);
  return NextResponse.json({ ok: true });
}
