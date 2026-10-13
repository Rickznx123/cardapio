import { NextResponse } from "next/server";
import { erroSlug } from "@/lib/slug";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { numeroWhats } from "@/lib/telefone";

const erro = (msg: string, status: number) => NextResponse.json({ erro: msg }, { status });
const MAX_POR_HORA = 5;

// Disponibilidade do slug ao vivo (o anon não enxerga empresas inativas, por isso via service role).
export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const problema = erroSlug(slug);
  if (problema) return NextResponse.json({ disponivel: false, erro: problema });
  const { data } = await createAdminClient().from("empresas").select("id").eq("slug", slug).maybeSingle();
  return NextResponse.json({ disponivel: !data, erro: data ? "Esse endereço já está em uso" : null });
}

// Cloudflare Turnstile. Sem chave: só passa fora de produção.
async function humano(token: unknown, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (typeof token !== "string" || !token) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  }).catch(() => null);
  return (await r?.json().catch(() => null))?.success === true;
}

// Cadastro self-service: empresa em teste grátis (trial_ate pelo default do banco) + dono, e já entra logado.
export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "desconhecido";
  const nome = String(b.nome ?? "").trim();
  const slug = String(b.slug ?? "").trim().toLowerCase();
  const donoNome = String(b.dono_nome ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const whatsapp = numeroWhats(String(b.whatsapp ?? ""));
  const senha = String(b.senha ?? "");

  if (!nome || !donoNome) return erro("Informe o nome da empresa e o seu nome", 400);
  const problema = erroSlug(slug);
  if (problema) return erro(problema, 400);
  if (!/^\S+@\S+\.\S+$/.test(email)) return erro("E-mail inválido", 400);
  if (!whatsapp) return erro("Informe o WhatsApp com DDD", 400);
  if (senha.length < 8) return erro("A senha precisa ter pelo menos 8 caracteres", 400);
  if (b.aceite !== true) return erro("É preciso aceitar os termos de uso e a política de privacidade", 400);

  const admin = createAdminClient();
  // Limite por IP (conta toda tentativa que passou da validação, deu certo ou não).
  const umaHora = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin.from("cadastro_tentativas").select("id", { count: "exact", head: true })
    .eq("ip", ip).gte("created_at", umaHora);
  if ((count ?? 0) >= MAX_POR_HORA) return erro("Muitos cadastros a partir desta rede. Tente de novo em 1 hora.", 429);
  await admin.from("cadastro_tentativas").insert({ ip });

  if (!(await humano(b.turnstile, ip))) return erro("Não foi possível confirmar que você não é um robô. Recarregue a página.", 400);

  const { data: existe } = await admin.from("empresas").select("id").eq("slug", slug).maybeSingle();
  if (existe) return erro("Esse endereço já está em uso", 409);

  const { data: criado, error: erroUser } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (erroUser) {
    return erroUser.code === "email_exists"
      ? erro("Já existe uma conta com esse e-mail. Entre pelo login.", 409)
      : erro(erroUser.message, 400);
  }
  const { data: empresa, error: erroEmpresa } = await admin.from("empresas")
    .insert({ nome, slug, whatsapp, origem_cadastro: "self" }).select("id").single();
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

  const supabase = await createClient(); // grava os cookies de sessão na resposta
  const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
  return NextResponse.json({ ok: true, logado: !erroLogin });
}
