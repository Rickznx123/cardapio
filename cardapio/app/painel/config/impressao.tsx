"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { toast } from "@/components/toast";
import { useArmazenado } from "@/lib/armazenado";
import { type ConfigImpressao, configImpressao, cuponsPedido, type PedidoBalcao } from "@/lib/cupom";
import { imprimir } from "@/lib/impressao";
import type { Empresa } from "../configuracoes";
import { botao, botaoSec, card, input, rotulo, supabase } from "../ui";
import { Endereco } from "./endereco";

const check = "size-5 accent-rose-600";
const code = "block overflow-x-auto whitespace-pre rounded-lg bg-neutral-100 p-3 font-mono text-sm dark:bg-neutral-800";

// Pedido fictício para a prévia e o teste de impressão.
const exemplo = (): PedidoBalcao => ({
  id: "teste", numero: 123, tipo: "entrega", status: "novo", origem: "web",
  cliente_nome: "Cliente Teste", cliente_telefone: "(66) 99999-0000", endereco: "Rua das Flores, 100", bairro_nome: "Centro",
  taxa_entrega: 5, subtotal: 54.8, total: 49.8, desconto: 10, cupom_id: "cupom-teste",
  cupons: { codigo: "BEMVINDO" }, observacao: "Sem talher",
  impresso_em: null, created_at: new Date().toISOString(), comanda_id: null,
  forma_pagamento: "dinheiro", troco_para: 100, pago: false, pago_em: null,
  pedido_itens: [
    { nome: "X-Burger", preco: 24.9, quantidade: 2, observacao: "sem cebola" },
    { nome: "Refrigerante lata", preco: 5, quantidade: 1, observacao: null },
  ],
  comandas: null, membros: null,
});

// Configurações ▸ Impressoras e tickets.
export function Impressao({ empresa, mudou }: { empresa: Empresa; mudou: (e: Empresa) => void }) {
  const [cfg, setCfg] = useState<ConfigImpressao>(configImpressao(empresa.config_impressao));
  const [salvando, setSalvando] = useState(false);
  const [auto, setAuto] = useArmazenado("balcao:impressao-automatica", true);
  const [pedido] = useState(exemplo);
  const vias = cuponsPedido(empresa.nome, pedido, cfg);
  const alterado = JSON.stringify(cfg) !== JSON.stringify(configImpressao(empresa.config_impressao));

  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.from("empresas").update({ config_impressao: cfg }).eq("id", empresa.id);
    setSalvando(false);
    if (error) return toast.erro(error.message);
    mudou({ ...empresa, config_impressao: cfg });
    toast.salvo("Configuração de impressão salva");
  }

  const mudar = (campos: Partial<ConfigImpressao>) => setCfg((c) => ({ ...c, ...campos }));

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span><span className="block font-medium">Impressão automática neste aparelho</span>
            <span className="text-sm text-neutral-500">Cada pedido novo sai na impressora padrão assim que chega. Vale só para este computador.</span></span>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className={check} />
        </label>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <section className={`${card} space-y-4`}>
          <h2 className="text-lg font-semibold">Ticket</h2>
          <div className="flex flex-wrap gap-4">
            <label><span className={rotulo}>Largura do papel</span>
              <select value={cfg.largura} onChange={(e) => mudar({ largura: Number(e.target.value) === 58 ? 58 : 80 })}
                className={`${input} w-32 dark:bg-neutral-950`}>
                <option value={80}>80 mm</option>
                <option value={58}>58 mm</option>
              </select>
            </label>
            <label><span className={rotulo}>Vias por pedido</span>
              <select value={cfg.vias} onChange={(e) => mudar({ vias: Number(e.target.value) })} className={`${input} w-28 dark:bg-neutral-950`}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span><span className="block font-medium">Via extra da cozinha, sem preços</span>
              <span className="text-sm text-neutral-500">Só itens e observações, sem valores, telefone ou endereço.</span></span>
            <input type="checkbox" checked={cfg.via_cozinha_sem_precos} onChange={(e) => mudar({ via_cozinha_sem_precos: e.target.checked })} className={check} />
          </label>
          <label className="block"><span className={rotulo}>Cabeçalho (abaixo do nome; ex.: CNPJ, telefone)</span>
            <textarea value={cfg.cabecalho} onChange={(e) => mudar({ cabecalho: e.target.value })} rows={2} maxLength={200}
              className={`${input} h-auto py-2`} />
          </label>
          <label className="block"><span className={rotulo}>Rodapé (ex.: &quot;Obrigado pela preferência!&quot;)</span>
            <textarea value={cfg.rodape} onChange={(e) => mudar({ rodape: e.target.value })} rows={2} maxLength={200}
              className={`${input} h-auto py-2`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={salvar} disabled={salvando || !alterado} className={botao}>{salvando ? "Salvando…" : "Salvar"}</button>
            <button onClick={() => { vias.forEach((v) => imprimir(v)); toast.ok(`Imprimindo ${vias.length} via(s) de teste`); }}
              className={`${botaoSec} h-11`}>
              <Printer className="size-4" /> Imprimir teste
            </button>
          </div>
        </section>

        <section className="space-y-2" aria-label="Prévia do ticket">
          <h2 className="text-sm font-semibold text-neutral-500">Prévia ({vias.length} via{vias.length > 1 ? "s" : ""})</h2>
          <div className="flex gap-3 overflow-x-auto">
            {vias.slice(-2).map((html, n) => (
              <iframe key={n} srcDoc={html} sandbox="" title={`Prévia da via ${n + 1}`}
                style={{ width: cfg.largura === 58 ? 230 : 310 }}
                className="h-[560px] shrink-0 rounded-lg border border-neutral-300 bg-white shadow-sm" />
            ))}
          </div>
          {vias.length > 2 && <p className="text-xs text-neutral-500">Mostrando as 2 últimas vias.</p>}
        </section>
      </div>

      <details className={`${card} group`}>
        <summary className="cursor-pointer text-lg font-semibold">Impressão sem diálogo (Chrome em modo quiosque, Windows)</summary>
        <div className="mt-4 space-y-4 text-sm leading-relaxed">
          <p>
            O painel imprime cada pedido novo sozinho quando o Chrome é aberto com
            <code className="mx-1 rounded bg-neutral-100 px-1 dark:bg-neutral-800">--kiosk-printing</code>, que envia direto para a
            impressora padrão, sem abrir a janela de impressão.
          </p>
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              <b>Impressora térmica como padrão.</b> Em Configurações → Bluetooth e dispositivos → Impressoras, desligue
              &quot;Permitir que o Windows gerencie minha impressora padrão&quot; e defina a térmica como padrão.
            </li>
            <li>
              <b>Criar o atalho.</b> Botão direito na Área de Trabalho → Novo → Atalho, e cole:
              <Endereco className={`${code} mt-2`} />
              <span className="mt-1 block text-neutral-500">
                Se o Chrome estiver em outro lugar, troque o caminho (veja em chrome://version). O --user-data-dir cria um perfil
                separado e o --autoplay-policy libera o som de alerta.
              </span>
            </li>
            <li>
              <b>Primeiro acesso.</b> Abra pelo atalho e entre com o usuário do caixa. Se aparecer a janela de impressão, escolha a
              térmica, margens &quot;Nenhuma&quot; e desmarque &quot;Cabeçalhos e rodapés&quot;.
            </li>
            <li><b>Abrir ao ligar o PC (opcional).</b> Win + R → shell:startup e copie o atalho para essa pasta.</li>
          </ol>
          <p className="text-neutral-500">
            Deixe só uma tela com impressão automática ligada: com duas, o sistema evita cupom repetido, mas cada pedido sai na
            impressora de quem pegou primeiro. Para testar sem impressora, use &quot;Salvar como PDF&quot;.
          </p>
        </div>
      </details>
    </div>
  );
}
