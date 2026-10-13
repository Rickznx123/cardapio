// Cliente da Evolution API (v2) na VPS. Server only: usa EVOLUTION_API_URL / EVOLUTION_API_KEY.

export const nomeInstancia = (empresaId: string) => `cardapio-${empresaId}`;

async function evo<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${process.env.EVOLUTION_API_URL!.replace(/\/$/, "")}${caminho}`, {
    ...init,
    headers: { apikey: process.env.EVOLUTION_API_KEY!, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Evolution ${r.status}: ${JSON.stringify(corpo)?.slice(0, 300)}`);
  return corpo as T;
}

// Cria a instância já com o webhook e devolve o QR (data URL base64).
export async function criarInstancia(nome: string, webhookUrl: string) {
  const r = await evo<{ qrcode?: { base64?: string } }>("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: nome,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
      webhook: { url: webhookUrl, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"] },
    }),
  });
  return r.qrcode?.base64 ?? null;
}

// QR novo para uma instância existente (o WhatsApp expira o QR em ~20s).
export async function obterQr(nome: string) {
  const r = await evo<{ base64?: string }>(`/instance/connect/${nome}`);
  return r.base64 ?? null;
}

// "open" = conectado. Instância inexistente conta como "close".
export async function estado(nome: string) {
  try {
    const r = await evo<{ instance?: { state?: string } }>(`/instance/connectionState/${nome}`);
    return r.instance?.state ?? "close";
  } catch {
    return "close";
  }
}

export async function numeroConectado(nome: string) {
  const r = await evo<{ ownerJid?: string }[]>(`/instance/fetchInstances?instanceName=${nome}`).catch(() => []);
  return r[0]?.ownerJid?.split("@")[0] ?? null;
}

// Sai do WhatsApp e apaga a instância (o próximo "Conectar" cria do zero).
export async function desconectar(nome: string) {
  await evo(`/instance/logout/${nome}`, { method: "DELETE" }).catch(() => null);
  await evo(`/instance/delete/${nome}`, { method: "DELETE" }).catch(() => null);
}

// `numero`: só dígitos com DDI (5566999999999) ou um JID completo. Devolve o id da mensagem enviada.
export async function enviarTexto(nome: string, numero: string, texto: string) {
  const r = await evo<{ key?: { id?: string } }>(`/message/sendText/${nome}`, {
    method: "POST",
    body: JSON.stringify({ number: numero, text: texto }),
  });
  return r.key?.id ?? null;
}

// Mídia de uma mensagem recebida (áudio) em base64.
export function baixarMidia(nome: string, key: object) {
  return evo<{ base64?: string; mimetype?: string }>(`/chat/getBase64FromMediaMessage/${nome}`, {
    method: "POST",
    body: JSON.stringify({ message: { key }, convertToMp4: false }),
  });
}
