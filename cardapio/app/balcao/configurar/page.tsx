import Link from "next/link";
import { Endereco } from "./endereco";

const code = "block overflow-x-auto whitespace-pre rounded bg-gray-100 p-3 font-mono text-sm dark:bg-gray-900";

export default function Configurar() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 p-4">
      <Link href="/balcao" className="text-sm underline">← Voltar ao balcão</Link>
      <h1 className="text-2xl font-bold">Configurar impressão automática (Windows)</h1>
      <p>
        O balcão imprime cada pedido novo sozinho quando o Chrome é aberto com a opção
        <code className="mx-1 rounded bg-gray-100 px-1 dark:bg-gray-900">--kiosk-printing</code>,
        que envia direto para a impressora padrão, sem abrir a janela de impressão.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Impressora térmica como padrão</h2>
        <p>
          Em <b>Configurações → Bluetooth e dispositivos → Impressoras</b>, desligue
          &quot;Permitir que o Windows gerencie minha impressora padrão&quot; e defina a térmica (80mm) como padrão.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Criar o atalho</h2>
        <p>Clique com o botão direito na Área de Trabalho → <b>Novo → Atalho</b> e cole no campo de local:</p>
        <Endereco className={code} />
        <p className="text-sm text-gray-500">
          Se o Chrome estiver em outro lugar, troque o caminho (veja em <code>chrome://version</code>, &quot;Caminho executável&quot;).
          O <code>--user-data-dir</code> cria um perfil separado, assim as opções valem mesmo com outro Chrome aberto.
          O <code>--autoplay-policy</code> libera o som de alerta sem precisar tocar na tela.
        </p>
        <p>Dê o nome <b>Balcão</b> e conclua.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Primeiro acesso</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abra pelo atalho e faça login com o usuário do caixa.</li>
          <li>Na primeira impressão, se aparecer a janela, escolha a térmica, margens <b>Nenhuma</b> e desmarque
            &quot;Cabeçalhos e rodapés&quot;. O Chrome lembra dessas opções.</li>
          <li>Deixe marcado &quot;Impressão automática&quot; no topo do balcão.</li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Abrir sozinho ao ligar o PC (opcional)</h2>
        <p>
          Aperte <b>Win + R</b>, digite <code className={"rounded bg-gray-100 px-1 dark:bg-gray-900"}>shell:startup</code> e
          copie o atalho para a pasta que abrir.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Dicas</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Deixe só <b>uma</b> tela de balcão com impressão automática. Se tiver duas, o sistema evita cupom repetido,
            mas cada pedido sai na impressora de quem pegou primeiro.</li>
          <li>Para testar sem impressora, abra o Chrome normal e use &quot;Salvar como PDF&quot;.</li>
          <li>Não deixe o PC entrar em suspensão: o balcão precisa ficar aberto para receber pedidos.</li>
        </ul>
      </section>
    </main>
  );
}
