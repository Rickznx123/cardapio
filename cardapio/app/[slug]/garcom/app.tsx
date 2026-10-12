"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoginGarcom } from "./login";
import { Painel, type Membro } from "./painel";

const supabase = createClient();

export function Garcom() {
  const { slug } = useParams<{ slug: string }>();
  const [membro, setMembro] = useState<Membro | null>();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setMembro(null);
      const { data } = await supabase
        .from("membros")
        .select("id, nome, empresa_id, empresas!inner(slug)")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .eq("empresas.slug", slug)
        .maybeSingle();
      setMembro(data ?? null);
    })();
  }, [slug]);

  return (
    <>
      <link rel="manifest" href={`/${slug}/garcom/manifest`} />
      <link rel="apple-touch-icon" href="/icons/garcom-192.png" />
      <meta name="theme-color" content="#E11D48" />
      {membro === undefined ? (
        <p className="p-4">Carregando…</p>
      ) : membro ? (
        <Painel membro={membro} />
      ) : (
        <LoginGarcom slug={slug} />
      )}
    </>
  );
}
