import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/server";
import type { BairroPublico, CategoriaPublica, EmpresaPublica, ItemPublico } from "@/lib/tipos";
import { Cardapio } from "./cardapio";

export default function Page({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<p className="p-4">Carregando cardápio…</p>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createPublicClient();

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome, slug, logo_url, cor_primaria, whatsapp, endereco, aceita_entrega, aceita_retirada, aberto")
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle<EmpresaPublica>();
  if (!empresa) notFound();

  const [categorias, itens, bairros] = await Promise.all([
    supabase.from("categorias").select("id, nome").eq("empresa_id", empresa.id).eq("ativo", true).order("ordem"),
    supabase.from("itens").select("id, categoria_id, nome, descricao, preco, foto_url, disponivel")
      .eq("empresa_id", empresa.id).order("ordem"),
    supabase.from("bairros").select("id, nome, taxa, pedido_minimo").eq("empresa_id", empresa.id).eq("ativo", true).order("nome"),
  ]);

  return (
    <Cardapio
      empresa={empresa}
      categorias={(categorias.data ?? []) as CategoriaPublica[]}
      itens={(itens.data ?? []) as ItemPublico[]}
      bairros={(bairros.data ?? []) as BairroPublico[]}
    />
  );
}
