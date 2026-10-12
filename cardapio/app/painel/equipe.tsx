"use client";

import { useState } from "react";
import { Check, KeyRound, Minus, UserPlus } from "lucide-react";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { Ativo, atualizar, botao, card, input, rotulo, useLista } from "./ui";

type Membro = { id: string; nome: string; papel: "dono" | "garcom" | "caixa"; ativo: boolean };

const papeis = { dono: "Dono", garcom: "Garçom", caixa: "Caixa" };
const corPapel = {
  dono: "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900",
  garcom: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  caixa: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

export function Equipe({ empresaId }: { empresaId: string }) {
  const [lista, recarregar] = useLista<Membro>("membros", empresaId, "nome");
  const [enviando, setEnviando] = useState(false);
  const [papel, setPapel] = useState<"garcom" | "caixa">("garcom");
  const [trocando, setTrocando] = useState<Membro | null>(null);

  async function cadastrar(form: HTMLFormElement) {
    setEnviando(true);
    const r = await fetch("/api/garcom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: empresaId, papel, ...Object.fromEntries(new FormData(form)) }),
    });
    setEnviando(false);
    if (!r.ok) return toast.erro((await r.json().catch(() => ({}))).erro ?? "Erro ao cadastrar");
    toast.ok(`${papeis[papel]} cadastrado`);
    form.reset(); // só limpa no sucesso
    recarregar();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); cadastrar(e.currentTarget); }} className={`${card} space-y-4`}>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800" role="radiogroup" aria-label="Tipo de usuário">
          {(["garcom", "caixa"] as const).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={p === papel} onClick={() => setPapel(p)}
              className={`h-10 rounded-lg text-sm font-semibold ${p === papel ? "bg-white shadow-sm dark:bg-neutral-950" : "text-neutral-600 dark:text-neutral-400"}`}>
              Novo {papeis[p].toLowerCase()}
            </button>
          ))}
        </div>
        <label className="block"><span className={rotulo}>Nome</span>
          <input name="nome" required className={input} />
        </label>
        {papel === "garcom" ? (
          <label className="block"><span className={rotulo}>PIN de 6 dígitos (o garçom usa para entrar)</span>
            <input name="pin" required inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="off"
              title="6 dígitos" className={`${input} tracking-[0.4em]`} />
          </label>
        ) : (
          <>
            <label className="block"><span className={rotulo}>E-mail</span>
              <input name="email" type="email" required autoComplete="off" className={input} />
            </label>
            <label className="block"><span className={rotulo}>Senha (mín. 6 caracteres)</span>
              <input name="senha" type="password" required minLength={6} autoComplete="new-password" className={input} />
            </label>
          </>
        )}
        <button disabled={enviando} className={botao}><UserPlus className="size-5" />{enviando ? "Cadastrando…" : "Cadastrar"}</button>
      </form>

      <ul className={`${card} divide-y divide-neutral-200 p-0 dark:divide-neutral-800`}>
        {lista.map((m) => (
          <li key={m.id} className={`flex items-center gap-3 p-3 ${m.ativo ? "" : "opacity-60"}`}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 font-semibold dark:bg-neutral-800">
              {m.nome[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{m.nome}</span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${corPapel[m.papel]}`}>{papeis[m.papel]}</span>
            {m.papel !== "dono" && (
              <>
                <button onClick={() => setTrocando(m)} aria-label={`Trocar ${m.papel === "garcom" ? "PIN" : "senha"} de ${m.nome}`}
                  className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
                  <KeyRound className="size-4" /><span className="hidden sm:inline">{m.papel === "garcom" ? "PIN" : "Senha"}</span>
                </button>
                <Ativo marcado={m.ativo} rotulo="" salvar={(v) => atualizar("membros", m.id, { ativo: v }).then(recarregar)} />
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500">A caixa de seleção ativa ou desativa o acesso. Desativado não entra em nenhuma tela.</p>

      <section className={`${card} overflow-x-auto p-0`}>
        <h2 className="p-4 pb-2 text-lg font-semibold">O que cada função pode fazer</h2>
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="px-4 py-2 font-medium">Função</th>
              {(["dono", "caixa", "garcom"] as const).map((p) => <th key={p} className="px-2 py-2 text-center font-medium">{papeis[p]}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {PERMISSOES.map(([acao, ...pode]) => (
              <tr key={acao}>
                <td className="px-4 py-2">{acao}</td>
                {pode.map((sim, n) => (
                  <td key={n} className="px-2 py-2 text-center">
                    {sim ? <Check className="mx-auto size-4 text-emerald-600" aria-label="Sim" /> : <Minus className="mx-auto size-4 text-neutral-300" aria-label="Não" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {trocando && <TrocarSegredo membro={trocando} fechar={() => setTrocando(null)} />}
    </div>
  );
}

// [ação, dono, caixa, garçom] — espelha a RLS e as RPCs do schema.sql.
const PERMISSOES: [string, boolean, boolean, boolean][] = [
  ["Lançar pedido de mesa (app do garçom)", true, true, true],
  ["Ver e atender pedidos, imprimir, mudar status", true, true, false],
  ["Novo pedido no balcão, receber pagamento, cancelar", true, true, false],
  ["Abrir e fechar a loja para pedidos", true, true, false],
  ["Caixa: abrir, sangria, suprimento, fechar", true, true, false],
  ["Histórico de pedidos e relatórios", true, true, false],
  ["Editar cardápio, mesas, bairros e taxas", true, false, false],
  ["Configurações, equipe e métodos de pagamento", true, false, false],
];

function TrocarSegredo({ membro, fechar }: { membro: Membro; fechar: () => void }) {
  const garcom = membro.papel === "garcom";
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setEnviando(true);
    const r = await fetch("/api/garcom", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membro_id: membro.id, segredo: valor }),
    });
    setEnviando(false);
    if (!r.ok) return toast.erro((await r.json().catch(() => ({}))).erro ?? "Não foi possível trocar");
    toast.ok(garcom ? `PIN de ${membro.nome} trocado` : `Senha de ${membro.nome} trocada`);
    fechar();
  }

  return (
    <Modal titulo={garcom ? `Novo PIN de ${membro.nome}` : `Nova senha de ${membro.nome}`} fechar={fechar}
      rodape={<button form="trocar-segredo" disabled={enviando} className={`${botao} w-full`}>{enviando ? "Salvando…" : "Salvar"}</button>}>
      <form id="trocar-segredo" className="p-5" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
        <label className="block"><span className={rotulo}>{garcom ? "PIN de 6 dígitos" : "Senha (mín. 6 caracteres)"}</span>
          {garcom ? (
            <input value={valor} onChange={(e) => setValor(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus
              inputMode="numeric" pattern="\d{6}" title="6 dígitos" autoComplete="off" className={`${input} tracking-[0.4em]`} />
          ) : (
            <input value={valor} onChange={(e) => setValor(e.target.value)} type="password" required autoFocus minLength={6}
              autoComplete="new-password" className={input} />
          )}
        </label>
        <p className="mt-2 text-sm text-neutral-500">{garcom ? "O garçom usa o novo PIN no próximo login." : "A senha antiga deixa de funcionar."}</p>
      </form>
    </Modal>
  );
}
