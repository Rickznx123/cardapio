import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/server";
import type { BairroPublico, CategoriaPublica, EmpresaPublica, ItemPublico } from "@/lib/tipos";
import { Cardapio } from "./cardapio";

export default function Page({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<Esqueleto />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createPublicClient();

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome, slug, logo_url, cor_primaria, whatsapp, endereco, capa_url, descricao, horario_texto, aceita_entrega, aceita_retirada, aberto")
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle<EmpresaPublica>();
  if (!empresa) notFound();

  const [categorias, itens, bairros] = await Promise.all([
    supabase.from("categorias").select("id, nome").eq("empresa_id", empresa.id).eq("ativo", true).order("ordem"),
    supabase.from("itens").select("id, categoria_id, nome, descricao, preco, foto_url, disponivel, destaque")
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

function Esqueleto() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse bg-white" aria-label="Carregando cardápio">
      <div className="h-28 bg-neutral-200" />
      <div className="space-y-3 p-4">
        <div className="-mt-12 size-20 rounded-full bg-neutral-300 ring-4 ring-white" />
        <div className="h-7 w-2/3 rounded bg-neutral-200" />
        {[0, 1, 2, 3].map((n) => <div key={n} className="h-24 rounded-2xl bg-neutral-100" />)}
      </div>
    </div>
  );
}
