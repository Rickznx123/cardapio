import * as Sentry from "@sentry/nextjs";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { montarMensagem, textoOferta, type ConfigRecuperador, type Oferta } from "@/lib/recuperador";
import { enviar } from "@/lib/whatsapp/servidor";

export const maxDuration = 120;

type Empresa = { empresa_id: string; instancia: string; slug: string; nome: string; enviados_hoje: number };
type Reserva = { envio_id: string; codigo: string; validade: string; telefone: string; nome: string | null; cliente_id: string } | null;

function autorizado(request: Request) {
  const secret = Buffer.from(process.env.CRON_SECRET ?? "");
  const recebido = Buffer.from(new URL(request.url).searchParams.get("secret") ?? "");
  return secret.length > 0 && recebido.length === secret.length && timingSafeEqual(secret, recebido);
}

function agoraCuiaba() {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Cuiaba", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  return `${p.find((x) => x.type === "hour")?.value}:${p.find((x) => x.type === "minute")?.value}`;
}

const aguardar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  if (!autorizado(request)) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const admin = createAdminClient();
  const { data: empresas, error } = await admin.rpc("recuperador_empresas");
  if (error) {
    Sentry.captureException(error, { tags: { rota: "recuperador-processar" } });
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const resumo: { empresa_id: string; enviados: number; falhas: number }[] = [];
  const erros: string[] = [];
  for (const empresa of (empresas ?? []) as Empresa[]) {
    const { data: cfg, error: erroConfig } = await admin.from("recuperador_config").select("*")
      .eq("empresa_id", empresa.empresa_id).maybeSingle();
    if (erroConfig) {
      console.error("recuperador config:", erroConfig);
      erros.push(`${empresa.empresa_id}: falha ao carregar configuração`);
      Sentry.captureException(erroConfig, { tags: { rota: "recuperador-processar" } });
      continue;
    }
    if (!cfg) continue;
    const config = cfg as ConfigRecuperador;
    const horario = agoraCuiaba();
    if (horario < config.janela_inicio.slice(0, 5) || horario >= config.janela_fim.slice(0, 5)) continue;
    const disponiveis = Math.max(0, config.limite_dia - Number(empresa.enviados_hoje));
    const limite = Math.min(3, disponiveis);
    if (!limite) continue;

    const { data: elegiveis, error: erroElegiveis } = await admin.rpc("recuperador_elegiveis", {
      p_empresa: empresa.empresa_id, p_limite: limite,
    });
    if (erroElegiveis) {
      console.error("recuperador elegíveis:", erroElegiveis);
      erros.push(`${empresa.empresa_id}: falha ao buscar clientes elegíveis`);
      Sentry.captureException(erroElegiveis, { tags: { rota: "recuperador-processar" } });
      continue;
    }

    let enviados = 0;
    let falhas = 0;
    for (const [indice, candidato] of (elegiveis ?? []).entries()) {
      const { data, error: erroReserva } = await admin.rpc("recuperador_reservar", {
        p_empresa: empresa.empresa_id, p_cliente: candidato.cliente_id,
      });
      if (erroReserva) {
        console.error("recuperador reserva:", erroReserva);
        erros.push(`${empresa.empresa_id}: falha ao reservar envio`);
        Sentry.captureException(erroReserva, { tags: { rota: "recuperador-processar" } });
        falhas++;
        continue;
      }
      const reserva = data as Reserva;
      if (!reserva) continue;
      const validade = new Date(reserva.validade).toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" });
      const texto = montarMensagem(config.mensagem || "Oi, {cliente}! Temos {oferta} para você no {empresa}. Use {cupom} até {validade}: {link_cardapio}", {
        cliente: reserva.nome || "tudo bem",
        empresa: empresa.nome,
        oferta: textoOferta(config.tipo_oferta as Oferta, Number(config.valor_oferta)),
        cupom: reserva.codigo,
        validade,
        link_cardapio: `${new URL(request.url).origin}/${empresa.slug}`,
      });

      let erroEnvio: unknown;
      let envioFalhou = false;
      try {
        await enviar(admin, empresa.instancia, reserva.telefone, texto);
      } catch (e) {
        envioFalhou = true;
        erroEnvio = e;
      }

      if (envioFalhou) {
        falhas++;
        const mensagem = erroEnvio instanceof Error ? erroEnvio.message.slice(0, 500) : "Falha desconhecida no envio";
        const { error: erroAtualizacao } = await admin.from("recuperador_envios")
          .update({ status: "falhou", erro: mensagem }).eq("id", reserva.envio_id);
        if (erroAtualizacao) {
          console.error("recuperador marcar falha:", erroAtualizacao);
          erros.push(`${empresa.empresa_id}: falha ao registrar envio com erro`);
          Sentry.captureException(erroAtualizacao, { tags: { rota: "recuperador-processar" } });
        } else {
          const { error: erroCliente } = await admin.from("clientes")
            .update({ ultimo_recuperador_em: null }).eq("id", reserva.cliente_id);
          if (erroCliente) {
            console.error("recuperador liberar cliente:", erroCliente);
            erros.push(`${empresa.empresa_id}: falha ao liberar cliente para nova tentativa`);
            Sentry.captureException(erroCliente, { tags: { rota: "recuperador-processar" } });
          }
        }
        console.error("recuperador envio:", erroEnvio);
        Sentry.captureException(erroEnvio, { tags: { rota: "recuperador-processar" } });
      } else {
        const { error: erroAtualizacao } = await admin.from("recuperador_envios")
          .update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null })
          .eq("id", reserva.envio_id);
        if (erroAtualizacao) {
          console.error("recuperador marcar enviado:", erroAtualizacao);
          erros.push(`${empresa.empresa_id}: mensagem enviada, mas falha ao registrar o status`);
          Sentry.captureException(erroAtualizacao, { tags: { rota: "recuperador-processar" } });
        } else {
          enviados++;
        }
      }

      if (indice < (elegiveis?.length ?? 0) - 1) await aguardar(20_000 + Math.floor(Math.random() * 20_001));
    }
    resumo.push({ empresa_id: empresa.empresa_id, enviados, falhas });
  }
  return NextResponse.json({ ok: erros.length === 0, empresas: resumo, erros }, { status: erros.length ? 500 : 200 });
}
