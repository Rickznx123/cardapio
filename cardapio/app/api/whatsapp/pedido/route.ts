import * as Sentry from "@sentry/nextjs";
import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { numeroWhats } from "@/lib/telefone";
import type { StatusPedido } from "@/lib/tipos";
import { preencher, type TipoMensagem, variaveisEmpresa, variaveisPedido } from "@/lib/whatsapp/mensagens";
import { CAMPOS_EMPRESA, enviar, primeiraVez, secretOk, textoAtivo } from "@/lib/whatsapp/servidor";

type Pedido = {
  id: string; empresa_id: string; status: StatusPedido; tipo: string; origem: string;
  cliente_telefone: string | null; cancelamento_motivo: string | null;
};
type Payload = { type: "INSERT" | "UPDATE" | "DELETE"; record: Pedido | null; old_record: Pedido | null };
type ItemPedido = { nome: string; quantidade: number; ponto_carne: string | null; observacao: string | null };

// Aviso a mandar para a mudança de status (só web/balcão com telefone; mesa nunca).
function avisoDe({ type, record: p, old_record: antes }: Payload): TipoMensagem | null {
  if (!p || p.tipo === "mesa" || (p.origem !== "web" && p.origem !== "balcao") || !numeroWhats(p.cliente_telefone)) return null;
  if (type === "INSERT") return p.status === "novo" ? "pedido_recebido" : null;
  if (type !== "UPDATE" || antes?.status === p.status) return null;
  if (p.status === "preparo") return "pedido_preparo";
  if (p.status === "saiu") return "pedido_saiu";
  if (p.status === "pronto" && p.tipo === "retirada") return "pedido_pronto_retirada";
  if (p.status === "cancelado") return "pedido_cancelado";
  return null;
}

// Supabase Database Webhook (insert/update em pedidos) → aviso no WhatsApp do cliente.
export async function POST(request: Request) {
  if (!secretOk(request)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const payload = (await request.json().catch(() => null)) as Payload | null;
  const tipo = payload && avisoDe(payload);
  if (!tipo) return NextResponse.json({ ok: true });
  const { id, empresa_id, status } = payload.record!;
  const origem = new URL(request.url).origin;

  after(async () => {
    try {
      const admin = createAdminClient();
      const { data: conexao } = await admin.from("whatsapp_conexoes").select("instancia")
        .eq("empresa_id", empresa_id).eq("status", "conectado").maybeSingle();
      const texto = conexao && (await textoAtivo(admin, empresa_id, tipo));
      if (!texto || !(await primeiraVez(admin, `pedido:${id}:${status}`))) return;
      // Relê o pedido: no INSERT o total ainda é 0 (as RPCs gravam o total logo depois).
      const [{ data: p }, { data: empresa }] = await Promise.all([
        admin.from("pedidos").select("id, numero, total, cliente_nome, cliente_telefone, cancelamento_motivo, pedido_itens(nome, quantidade, ponto_carne, observacao)").eq("id", id).single(),
        admin.from("empresas").select(CAMPOS_EMPRESA).eq("id", empresa_id).single(),
      ]);
      if (!p || !empresa || !(await admin.rpc("empresa_liberada", { p_empresa: empresa_id })).data) return;
      const vars = { ...variaveisEmpresa(empresa, origem), ...variaveisPedido(p, empresa.slug, origem) };
      const resumoItens = tipo === "pedido_recebido"
        ? (p.pedido_itens as ItemPedido[]).map((i) =>
          `${i.quantidade}x ${i.nome}${i.ponto_carne ? ` (ponto: ${i.ponto_carne})` : ""}${i.observacao ? ` — ${i.observacao}` : ""}`,
        ).join("\n")
        : "";
      const motivo = tipo === "pedido_cancelado" && p.cancelamento_motivo
        ? `\n\nMotivo: ${p.cancelamento_motivo}`
        : "";
      const mensagem = preencher(texto, vars) + (resumoItens ? `\n\nItens:\n${resumoItens}` : "") + motivo;
      await enviar(admin, conexao.instancia, numeroWhats(p.cliente_telefone)!, mensagem);
    } catch (e) {
      console.error("whatsapp pedido:", e);
      Sentry.captureException(e, { tags: { rota: "whatsapp-pedido" } });
    }
  });
  return NextResponse.json({ ok: true });
}
