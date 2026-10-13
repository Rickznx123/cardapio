import Link from "next/link";

const link = "underline underline-offset-2 hover:text-neutral-700";

// Rodapé do cardápio público. Abre em outra aba para não sair do cardápio/checkout.
export function RodapeLegal() {
  return (
    <footer className="px-4 pt-10 pb-4 text-center text-xs text-neutral-400">
      <Link href="/termos" target="_blank" className={link}>Termos de uso</Link>
      {" · "}
      <Link href="/privacidade" target="_blank" className={link}>Política de privacidade</Link>
    </footer>
  );
}

export function AceiteLegal() {
  return (
    <p className="text-center text-xs text-neutral-500">
      Ao fazer o pedido você concorda com os{" "}
      <Link href="/termos" target="_blank" className={link}>Termos de uso</Link> e a{" "}
      <Link href="/privacidade" target="_blank" className={link}>Política de privacidade</Link>.
    </p>
  );
}
