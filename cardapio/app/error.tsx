"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { TelaErro } from "@/components/tela-erro";

export default function Erro({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <TelaErro codigo="ERRO" titulo="Algo deu errado"
      texto="Tivemos um problema ao carregar esta página. Tente de novo em instantes.">
      <button onClick={retry} className="inline-flex h-12 items-center rounded-xl bg-rose-600 px-5 font-semibold text-white hover:bg-rose-700">
        Tentar de novo
      </button>
    </TelaErro>
  );
}
