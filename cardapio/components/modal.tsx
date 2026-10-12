"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// Modal nativo (<dialog>): foco preso, Esc e backdrop de graça. Bottom sheet no celular, centralizado no desktop.
// Abre ao montar; para fechar, o pai desmonta (ou o usuário fecha, que chama `fechar`).
export function Modal({ titulo, fechar, children, rodape, tamanho = "sm:max-w-lg" }: {
  titulo: React.ReactNode; fechar: () => void; children: React.ReactNode; rodape?: React.ReactNode; tamanho?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} onClose={fechar} aria-labelledby={id}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      className={`animate-subir m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-white p-0 text-neutral-900 backdrop:bg-black/50 sm:m-auto sm:rounded-2xl dark:bg-neutral-900 dark:text-neutral-100 ${tamanho}`}>
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <h2 id={id} className="min-w-0 flex-1 truncate text-lg font-bold">{titulo}</h2>
          <button onClick={() => ref.current?.close()} aria-label="Fechar"
            className="flex size-10 items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {rodape && (
          <footer className="shrink-0 border-t border-neutral-200 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] dark:border-neutral-800">
            {rodape}
          </footer>
        )}
      </div>
    </dialog>
  );
}
