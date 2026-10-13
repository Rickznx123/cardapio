import type { Metadata } from "next";
import Link from "next/link";
import { CONTATO, FORO, OPERADORA } from "../dados";

export const metadata: Metadata = { title: "Termos de uso · Cardápio Digital" };

export default function Termos() {
  return (
    <article>
      <h1>Termos de uso</h1>
      <p className="text-sm text-neutral-500">Última atualização: 13 de outubro de 2026</p>

      <p>
        Estes termos regem o uso do Cardápio Digital, plataforma fornecida por {OPERADORA} (&quot;plataforma&quot;) para que
        restaurantes, lanchonetes e similares (&quot;restaurantes&quot;) publiquem seu cardápio e recebam pedidos de seus
        clientes (&quot;consumidores&quot;). Ao usar o serviço, você concorda com estes termos e com a{" "}
        <Link href="/privacidade" className="font-medium text-rose-700 underline">Política de privacidade</Link>.
      </p>

      <h2>1. O que a plataforma faz</h2>
      <p>
        A plataforma oferece a tecnologia: cardápio online, carrinho, envio do pedido ao restaurante, painel de gestão,
        impressão de cupons e, opcionalmente, atendimento automático e avisos pelo WhatsApp. <b>A plataforma não vende,
        prepara nem entrega produtos</b> e não é parte da compra: o pedido é feito diretamente com o restaurante.
      </p>

      <h2>2. Para consumidores</h2>
      <ul>
        <li>Preços, disponibilidade, taxas de entrega, tempo estimado e área atendida são definidos pelo restaurante.</li>
        <li>
          Informe dados corretos (nome, telefone, endereço). O restaurante pode entrar em contato para confirmar ou
          cancelar o pedido.
        </li>
        <li>
          Pagamento, troco, nota fiscal, trocas, qualidade dos produtos, alergênicos e entrega são de responsabilidade do
          restaurante. Problemas com o pedido devem ser tratados com ele.
        </li>
        <li>
          O atendimento automático pelo WhatsApp (inclusive com inteligência artificial) serve para informar e indicar o
          link do cardápio; ele pode errar e não fecha pedidos. Vale sempre o que está no cardápio no momento do pedido.
        </li>
      </ul>

      <h2>3. Para restaurantes</h2>
      <ul>
        <li>A conta é pessoal; o responsável guarda o sigilo das senhas e responde pelo uso feito pela sua equipe.</li>
        <li>
          O restaurante é responsável pelo conteúdo que publica (nomes, fotos, descrições, preços), pela veracidade das
          informações, pelo cumprimento do Código de Defesa do Consumidor, das normas sanitárias e fiscais e pela entrega.
        </li>
        <li>
          Como <b>controlador</b> dos dados dos seus clientes (LGPD), o restaurante deve usá-los apenas para atender pedidos
          e se comunicar com eles de forma legítima, e responder aos pedidos dos titulares. A plataforma atua como operadora.
        </li>
        <li>
          Ao conectar um número de WhatsApp, o restaurante se compromete a seguir os termos e políticas do WhatsApp e a não
          enviar mensagens em massa não solicitadas (spam).
        </li>
        <li>Planos, valores e forma de cobrança são combinados à parte, na contratação.</li>
      </ul>

      <h2>4. Uso proibido</h2>
      <ul>
        <li>publicar conteúdo ilegal, ofensivo, enganoso ou que viole direitos de terceiros (inclusive fotos sem autorização);</li>
        <li>vender produtos proibidos ou sem as licenças exigidas;</li>
        <li>tentar acessar dados de outras empresas, burlar a segurança ou sobrecarregar o sistema;</li>
        <li>usar a plataforma para fraude ou para enviar spam.</li>
      </ul>

      <h2>5. Suspensão e encerramento</h2>
      <p>
        A plataforma pode suspender ou desativar contas que violem estes termos, que estejam com pagamento em atraso ou
        quando exigido por lei. Com a conta desativada, o cardápio público e o painel ficam indisponíveis. O restaurante
        pode encerrar a conta a qualquer momento pelo contato abaixo.
      </p>

      <h2>6. Disponibilidade</h2>
      <p>
        Trabalhamos para manter o serviço no ar, mas ele pode ter interrupções para manutenção ou por falhas de terceiros
        (internet, hospedagem, WhatsApp). Recomendamos que o restaurante tenha um meio alternativo de receber pedidos.
      </p>

      <h2>7. Responsabilidade</h2>
      <p>
        Na medida permitida pela lei, a plataforma não responde por danos decorrentes da relação de consumo entre
        restaurante e consumidor, de informações publicadas pelo restaurante, de respostas do atendimento automático, de
        indisponibilidade de serviços de terceiros ou de lucros cessantes. Nada nestes termos afasta direitos garantidos
        ao consumidor pela legislação.
      </p>

      <h2>8. Propriedade intelectual</h2>
      <p>
        O software, a marca e o layout da plataforma pertencem à plataforma. O conteúdo publicado pelo restaurante
        (marca, fotos, textos) continua dele, que autoriza a plataforma a exibi-lo para prestar o serviço.
      </p>

      <h2>9. Alterações</h2>
      <p>
        Estes termos podem ser atualizados. Mudanças relevantes serão avisadas aos restaurantes com antecedência
        razoável; a data no topo indica a versão vigente.
      </p>

      <h2>10. Lei e foro</h2>
      <p>
        Aplica-se a legislação brasileira. Fica eleito o foro de {FORO}, ressalvado o direito do consumidor de propor ação
        no foro do seu domicílio. Contato: {CONTATO}.
      </p>
    </article>
  );
}
