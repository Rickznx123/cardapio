import { Suspense } from "react";
import { Garcom } from "./app";

export default function Page() {
  return (
    <Suspense fallback={<p className="p-4">Carregando…</p>}>
      <Garcom />
    </Suspense>
  );
}
