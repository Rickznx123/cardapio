import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { SITE_URL } from "@/lib/marca";
import { createPublicClient } from "@/lib/supabase/server";

// Páginas do produto + cardápios das lojas ativas (atualiza a cada hora).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  const { data } = await createPublicClient().from("empresas").select("slug")
    .eq("ativo", true).in("plano_status", ["ativo", "trial"]);
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/cadastro`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/termos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: "yearly", priority: 0.2 },
    ...(data ?? []).map((e) => ({ url: `${SITE_URL}/${e.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
  ];
}
