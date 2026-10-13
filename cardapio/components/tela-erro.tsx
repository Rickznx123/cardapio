import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";

// Casca comum do 404 e do erro geral.
export function TelaErro({ codigo, titulo, texto, children }: {
  codigo: string; titulo: string; texto: string; children?: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-neutral-50 p-6 text-center text-neutral-900">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
        <UtensilsCrossed className="size-8" />
      </span>
      <p className="text-sm font-bold tracking-widest text-rose-600">{codigo}</p>
      <h1 className="text-2xl font-bold text-balance">{titulo}</h1>
      <p className="max-w-sm text-neutral-600 text-pretty">{texto}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {children}
        <Link href="/" className="inline-flex h-12 items-center rounded-xl border border-neutral-300 px-5 font-semibold hover:bg-neutral-100">
          Página inicial
        </Link>
      </div>
    </main>
  );
}
