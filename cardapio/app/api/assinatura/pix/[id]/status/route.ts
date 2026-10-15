import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { donoLogado, processarRecurso } from "@/lib/assinatura";
import { createAdminClient } from "@/lib/supabase/server";

// Status de um Pix da própria empresa. Se ainda está pendente, consulta o MP (não depende só do webhook).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dono = await donoLogado();
  if (!dono) return NextResponse.json({ erro: "Sem permissão" }, { status: 403 });
  const ler = () => dono.supabase.from("pagamentos").select("status")
    .eq("mp_id", id).eq("empresa_id", dono.empresa.id).eq("tipo", "pix").maybeSingle();
  let { data } = await ler();
  if (!data) return NextResponse.json({ erro: "Pagamento não encontrado" }, { status: 404 });
  if (data.status === "pendente") {
    try {
      await processarRecurso(createAdminClient(), "payment", id);
      ({ data } = await ler());
    } catch (e) {
      Sentry.captureException(e, { tags: { rota: "assinatura-pix-status" } });
    }
  }
  return NextResponse.json({ status: data?.status ?? "pendente" });
}
