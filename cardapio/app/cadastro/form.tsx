"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Check, CircleAlert } from "lucide-react";
import { gerarSlug } from "@/lib/slug";
import { mascaraTelefone } from "@/lib/telefone";

declare global { interface Window { turnstile?: { reset: () => void } } }

type Slug = { estado: "vazio" | "verificando" | "ok" | "erro"; msg?: string };
const campo = "h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-base focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30";
const rotulo = "mb-1 block text-sm font-medium";

export function FormCadastro({ siteKey }: { siteKey: string | null }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [slugManual, setSlugManual] = useState<string | null>(null); // null = segue o nome
  const [whats, setWhats] = useState("");
  const [situacao, setSituacao] = useState<Slug>({ estado: "vazio" });
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const slug = slugManual ?? gerarSlug(nome);

  // Checa a disponibilidade 400ms depois de parar de digitar.
  useEffect(() => {
    if (!slug) return;
    const t = setTimeout(() => {
      setSituacao({ estado: "verificando" });
      fetch(`/api/cadastro?slug=${encodeURIComponent(slug)}`).then((r) => r.json())
        .then((j) => setSituacao(j.disponivel ? { estado: "ok" } : { estado: "erro", msg: j.erro }))
        .catch(() => setSituacao({ estado: "vazio" }));
    }, 400);
    return () => clearTimeout(t);
  }, [slug]);

  async function enviar(f: FormData) {
    setErro("");
    setEnviando(true);
    const r = await fetch("/api/cadastro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome, slug, whatsapp: whats, dono_nome: f.get("dono_nome"), email: f.get("email"), senha: f.get("senha"),
        aceite: f.get("aceite") === "on", turnstile: f.get("cf-turnstile-response"),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setEnviando(false);
      window.turnstile?.reset(); // o token só vale uma vez
      return setErro(j.erro ?? "Não foi possível criar a conta");
    }
    window.fbq?.("track", "CompleteRegistration");
    router.replace(j.logado ? "/painel/comecar" : "/login");
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); enviar(new FormData(e.currentTarget)); }} className="mt-6 space-y-4">
      {siteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />}
      <label className="block"><span className={rotulo}>Nome da loja</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} placeholder="Ex.: Lanchonete do Zé"
          className={campo} />
      </label>
      <label className="block"><span className={rotulo}>Endereço do seu cardápio</span>
        <span className="flex items-center rounded-lg border border-neutral-300 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/30">
          <span className="pl-3 text-sm text-neutral-500">…/</span>
          <input value={slug} onChange={(e) => setSlugManual(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            required maxLength={40} aria-describedby="slug-status" autoCapitalize="none"
            className="h-12 w-full min-w-0 rounded-lg bg-transparent px-1 text-base focus:outline-none" />
        </span>
        <span id="slug-status" aria-live="polite" className="mt-1 flex min-h-5 items-center gap-1 text-sm">
          {slug && situacao.estado === "ok" && <><Check className="size-4 text-emerald-600" /> <span className="text-emerald-700">Disponível</span></>}
          {slug && situacao.estado === "erro" && <><CircleAlert className="size-4 text-red-600" /> <span className="text-red-700">{situacao.msg}</span></>}
          {slug && situacao.estado === "verificando" && <span className="text-neutral-500">Verificando…</span>}
        </span>
      </label>
      <label className="block"><span className={rotulo}>Seu nome</span>
        <input name="dono_nome" required autoComplete="name" className={campo} />
      </label>
      <label className="block"><span className={rotulo}>E-mail</span>
        <input name="email" type="email" required autoComplete="email" className={campo} />
      </label>
      <label className="block"><span className={rotulo}>WhatsApp</span>
        <input value={whats} onChange={(e) => setWhats(mascaraTelefone(e.target.value))} required inputMode="tel"
          autoComplete="tel-national" placeholder="(66) 99999-9999" className={campo} />
      </label>
      <label className="block"><span className={rotulo}>Senha (mín. 8 caracteres)</span>
        <input name="senha" type="password" required minLength={8} autoComplete="new-password" className={campo} />
      </label>
      <label className="flex items-start gap-2 text-sm text-neutral-700">
        <input name="aceite" type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-rose-600" />
        <span>
          Li e aceito os <Link href="/termos" target="_blank" className="font-medium text-rose-700 underline">Termos de uso</Link> e a{" "}
          <Link href="/privacidade" target="_blank" className="font-medium text-rose-700 underline">Política de privacidade</Link>.
        </span>
      </label>
      {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-language="pt-br" />}
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      <button disabled={enviando || situacao.estado === "erro"}
        className="h-12 w-full rounded-lg bg-rose-600 font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
        {enviando ? "Criando sua loja…" : "Criar minha loja grátis"}
      </button>
    </form>
  );
}
