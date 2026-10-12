import Link from "next/link";
import { ArrowRight, Printer, Smartphone, UtensilsCrossed, Wallet } from "lucide-react";

const beneficios = [
  {
    Icone: Smartphone,
    titulo: "Cardápio no celular do cliente",
    texto: "Link próprio com fotos, preços e carrinho. Entrega com taxa por bairro ou retirada no balcão.",
  },
  {
    Icone: Wallet,
    titulo: "Sem comissão por pedido",
    texto: "O pedido chega direto para você, com resumo pronto no WhatsApp. Nada de intermediário.",
  },
  {
    Icone: Printer,
    titulo: "Da mesa à cozinha em segundos",
    texto: "Garçom lança pelo celular, o balcão recebe em tempo real e o cupom sai impresso sozinho.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white text-neutral-900">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between p-4">
        <span className="flex items-center gap-2 font-bold text-rose-600">
          <UtensilsCrossed className="size-6" /> Cardápio Digital
        </span>
        <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-semibold hover:bg-neutral-100">Entrar</Link>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pt-12 pb-16 text-center sm:pt-20">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
            Seu cardápio online, pedidos na mesa e no delivery, <span className="text-rose-600">tudo num lugar só</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-neutral-600 text-pretty">
            Feito para lanchonetes e restaurantes pequenos. Sem app para baixar, sem complicação.
          </p>
          <Link href="/login"
            className="mt-8 inline-flex h-14 items-center gap-2 rounded-2xl bg-rose-600 px-8 text-lg font-semibold text-white shadow-lg shadow-rose-600/20 hover:bg-rose-700">
            Entrar <ArrowRight className="size-5" />
          </Link>
        </section>

        <section className="bg-neutral-50 py-16">
          <ul className="mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-3">
            {beneficios.map(({ Icone, titulo, texto }) => (
              <li key={titulo} className="rounded-2xl bg-white p-6 shadow-sm">
                <span className="flex size-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <Icone className="size-6" />
                </span>
                <h2 className="mt-4 text-lg font-semibold">{titulo}</h2>
                <p className="mt-1 text-neutral-600">{texto}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="p-6 text-center text-sm text-neutral-500">© Cardápio Digital</footer>
    </div>
  );
}
