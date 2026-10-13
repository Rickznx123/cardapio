import Link from "next/link";
import { UtensilsCrossed } from "lucide-react";

// Termos e privacidade: texto longo, legível no celular.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-white text-neutral-900">
      <header className="mx-auto flex w-full max-w-3xl items-center p-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-rose-600">
          <UtensilsCrossed className="size-6" /> Cardápio Digital
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 leading-relaxed text-neutral-700 [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-neutral-900 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-neutral-900 [&_li]:mt-1 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </main>
      <footer className="p-6 text-center text-sm text-neutral-500">
        <Link href="/termos" className="hover:underline">Termos de uso</Link> · <Link href="/privacidade" className="hover:underline">Privacidade</Link>
      </footer>
    </div>
  );
}
