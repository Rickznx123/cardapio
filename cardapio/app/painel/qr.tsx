"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Copy, Download } from "lucide-react";
import QRCode from "qrcode";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";

// QR do cardápio para imprimir nas mesas/balcão + links para copiar.
const nada = () => () => {};

export function QrModal({ slug, nome, fechar }: { slug: string; nome: string; fechar: () => void }) {
  const origem = useSyncExternalStore(nada, () => location.origin, () => "");
  const [qr, setQr] = useState<string | null>(null);
  const urls = origem ? { cardapio: `${origem}/${slug}`, garcom: `${origem}/${slug}/garcom` } : null;
  const alvo = urls?.cardapio;

  useEffect(() => {
    if (!alvo) return;
    QRCode.toDataURL(alvo, { width: 1024, margin: 2, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch((e: Error) => toast.erro(e.message));
  }, [alvo]);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.ok("Link copiado");
    } catch {
      toast.erro("Não foi possível copiar");
    }
  }

  return (
    <Modal titulo="QR Code e links" fechar={fechar}>
      <div className="space-y-5 p-5">
        <div className="flex flex-col items-center gap-3">
          {qr ? (
            <img src={qr} alt={`QR Code do cardápio de ${nome}`} className="size-56 rounded-xl border border-neutral-200 bg-white p-2" />
          ) : (
            <div className="size-56 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
          )}
          {qr && (
            <a href={qr} download={`cardapio-${slug}.png`}
              className="flex h-11 items-center gap-2 rounded-lg bg-rose-600 px-5 font-semibold text-white hover:bg-rose-700">
              <Download className="size-5" /> Baixar PNG
            </a>
          )}
          <p className="text-center text-sm text-neutral-500">Imprima e cole nas mesas, no balcão ou na embalagem do delivery.</p>
        </div>

        {urls && (
          <ul className="space-y-2">
            {([["Cardápio (clientes)", urls.cardapio], ["App do garçom", urls.garcom]] as const).map(([rotulo, url]) => (
              <li key={url}>
                <span className="mb-1 block text-sm font-medium">{rotulo}</span>
                <div className="flex gap-2">
                  <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={rotulo}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
                  <button onClick={() => copiar(url)} aria-label={`Copiar link: ${rotulo}`}
                    className="flex size-10 items-center justify-center rounded-lg border border-neutral-300 dark:border-neutral-700">
                    <Copy className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
