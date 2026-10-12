"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

// Drawer lateral (<dialog> nativo à direita). Abre ao montar; o pai desmonta para fechar.
export function Drawer({ titulo, fechar, children, rodape }: {
  titulo: React.ReactNode; fechar: () => void; children: React.ReactNode; rodape?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { ref.current?.showModal(); }, []);

  return (
    <dialog ref={ref} onClose={fechar} aria-labelledby={id}
      onClick={(e) => e.target === ref.current && ref.current.close()}
      className="animate-deslizar m-0 ml-auto h-dvh max-h-dvh w-full max-w-md bg-white p-0 text-neutral-900 backdrop:bg-black/40 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
          <h2 id={id} className="min-w-0 flex-1 truncate text-lg font-bold">{titulo}</h2>
          <button onClick={() => ref.current?.close()} aria-label="Fechar"
            className="flex size-10 items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {rodape && <footer className="border-t border-neutral-200 p-4 dark:border-neutral-800">{rodape}</footer>}
      </div>
    </dialog>
  );
}
