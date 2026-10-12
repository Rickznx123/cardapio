import { Suspense } from "react";
import { Pedido } from "./resumo";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-4">Carregando…</p>}>
      <Pedido />
    </Suspense>
  );
}
