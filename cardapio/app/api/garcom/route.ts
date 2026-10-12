import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { emailGarcom } from "@/lib/garcom";

const erro = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });

// Dono cadastra equipe. Garçom: nome + PIN (e-mail sintético). Caixa: nome + e-mail + senha (loga no /login).
export async function POST(request: Request) {
  const { empresa_id, nome, papel = "garcom", pin, email, senha } = await request.json().catch(() => ({}));
  const nomeLimpo = typeof nome === "string" ? nome.trim() : "";
  if (typeof empresa_id !== "string" || !nomeLimpo) return erro("Informe o nome", 400);
  if (papel === "garcom" && !/^\d{6}$/.test(String(pin))) return erro("PIN deve ter 6 dígitos", 400);
  if (papel === "caixa" && (typeof email !== "string" || !email.includes("@") || String(senha ?? "").length < 6)) {
    return erro("Informe e-mail e senha (mín. 6 caracteres)", 400);
  }
  if (papel !== "garcom" && papel !== "caixa") return erro("Papel inválido", 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return erro("Não autenticado", 401);

  const { data: dono } = await supabase
    .from("membros")
    .select("id, empresas(slug)")
    .eq("empresa_id", empresa_id)
    .eq("user_id", user.id)
    .eq("papel", "dono")
    .eq("ativo", true)
    .maybeSingle();
  const slug = (dono?.empresas as { slug?: string } | null)?.slug;
  if (!slug) return erro("Sem permissão", 403);

  const admin = createAdminClient();
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: papel === "garcom" ? emailGarcom(nomeLimpo, slug) : email.trim().toLowerCase(),
    password: String(papel === "garcom" ? pin : senha),
    email_confirm: true,
  });
  if (error) {
    if (error.code === "email_exists") {
      return erro(papel === "garcom" ? "Já existe um garçom com esse nome" : "E-mail já cadastrado", 409);
    }
    return erro(error.message, 400);
  }

  const { error: erroMembro } = await admin.from("membros").insert({
    empresa_id,
    user_id: criado.user.id,
    nome: nomeLimpo,
    papel,
  });
  if (erroMembro) {
    await admin.auth.admin.deleteUser(criado.user.id); // não deixa usuário órfão
    return erro(erroMembro.message, 400);
  }
  return NextResponse.json({ ok: true });
}
