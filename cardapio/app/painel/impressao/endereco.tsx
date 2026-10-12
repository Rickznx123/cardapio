"use client";

import { useSyncExternalStore } from "react";

const nada = () => () => {};

// Monta o comando do atalho com o domínio real em que o sistema está aberto.
export function Endereco({ className }: { className: string }) {
  const origem = useSyncExternalStore(nada, () => location.origin, () => "https://SEU-DOMINIO");
  const cmd =
    `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing ` +
    `--autoplay-policy=no-user-gesture-required --user-data-dir="C:\\BalcaoChrome" --app=${origem}/painel`;
  return <code className={className}>{cmd}</code>;
}
