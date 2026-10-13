import { NextResponse } from "next/server";
import { erroSlug } from "@/lib/slug";
import { createAdminClient, createClient } from "@/lib/supabase/server";

const erro = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });

// Quem chama está logado com um e-mail de SUPERADMIN_EMAILS (lista separada por vírgula)?
async function eSuperadmin() {
  const lista = (process.env.SUPERADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const { data: { user } } = await (await createClient()).auth.getUser();
  return !!user?.email && lista.includes(user.email.toLowerCase());
}

// Lista de empresas com pedidos dos últimos 30 dias.
export async function GET() {
  if (!(await eSuperadmin())) return erro("Sem acesso", 403);
  const { data, error } = await createAdminClient().rpc("superadmin_empresas");
  if (error) return erro(error.message, 400);
  return NextResponse.json(data);
}

// Cria empresa + usuário dono numa operação só (desfaz o que já foi criado se algo falhar).
export async function POST(request: Request) {
  if (!(await eSuperadmin())) return erro("Sem acesso", 403);
  const b = await request.json().catch(() => ({}));
  const nome = String(b.nome ?? "").trim();
  const slug = String(b.slug ?? "").trim().toLowerCase();
  const donoNome = String(b.dono_nome ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const senha = String(b.senha ?? "");
  if (!nome || !donoNome) return erro("Informe o nome da empresa e do dono", 400);
  const problema = erroSlug(slug);
  if (problema) return erro(problema, 400);
  if (!email.includes("@")) return erro("E-mail inválido", 400);
  if (senha.length < 8) return erro("A senha provisória precisa ter pelo menos 8 caracteres", 400);

  const admin = createAdminClient();
  const { data: existe } = await admin.from("empresas").select("id").eq("slug", slug).maybeSingle();
  if (existe) return erro("Esse endereço já está em uso", 409);

  const { data: criado, error: erroUser } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (erroUser) return erro(erroUser.code === "email_exists" ? "E-mail já cadastrado" : erroUser.message, erroUser.code === "email_exists" ? 409 : 400);

  const { data: empresa, error: erroEmpresa } = await admin.from("empresas").insert({ nome, slug }).select("id").single();
  if (erroEmpresa) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return erro(erroEmpresa.code === "23505" ? "Esse endereço já está em uso" : erroEmpresa.message, 400);
  }
  const { error: erroMembro } = await admin.from("membros")
    .insert({ empresa_id: empresa.id, user_id: criado.user.id, nome: donoNome, papel: "dono" });
  if (erroMembro) {
    await admin.from("empresas").delete().eq("id", empresa.id);
    await admin.auth.admin.deleteUser(criado.user.id);
    return erro(erroMembro.message, 400);
  }
  return NextResponse.json({ id: empresa.id });
}

// Ativa/desativa empresa.
export async function PATCH(request: Request) {
  if (!(await eSuperadmin())) return erro("Sem acesso", 403);
  const { empresa_id, ativo } = await request.json().catch(() => ({}));
  if (typeof empresa_id !== "string" || typeof ativo !== "boolean") return erro("Dados inválidos", 400);
  const { error } = await createAdminClient().from("empresas").update({ ativo }).eq("id", empresa_id);
  if (error) return erro(error.message, 400);
  return NextResponse.json({ ok: true });
}
