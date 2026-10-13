import type { Metadata } from "next";
import { PRODUTO } from "@/lib/marca";
import { CONTATO, OPERADORA } from "../dados";

export const metadata: Metadata = { title: `Política de privacidade · ${PRODUTO}` };

export default function Privacidade() {
  return (
    <article>
      <h1>Política de privacidade</h1>
      <p className="text-sm text-neutral-500">Última atualização: 13 de outubro de 2026</p>

      <p>
        Esta política explica como os dados pessoais são tratados quando você faz um pedido pelo cardápio digital de um
        restaurante, conversa com o atendimento automático dele no WhatsApp ou usa o painel da plataforma. Ela segue a Lei
        Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h2>1. Quem é responsável pelos seus dados</h2>
      <ul>
        <li>
          <b>Restaurante (controlador):</b> o estabelecimento do qual você faz o pedido decide para que e como seus dados são
          usados. É ele quem recebe o pedido, prepara, entrega e fala com você.
        </li>
        <li>
          <b>Plataforma (operadora):</b> {OPERADORA} fornece o sistema de cardápio digital e trata os dados em nome do
          restaurante, seguindo as instruções dele e esta política.
        </li>
      </ul>

      <h2>2. Dados que coletamos dos consumidores</h2>
      <ul>
        <li><b>Identificação e contato:</b> nome e telefone (WhatsApp).</li>
        <li><b>Entrega:</b> endereço, bairro e observações que você informar.</li>
        <li><b>Pedido:</b> itens, quantidades, observações, valores, forma de pagamento e valor para troco.</li>
        <li>
          <b>Atendimento pelo WhatsApp:</b> número, nome de perfil e o conteúdo das mensagens enviadas ao atendimento
          automático do restaurante. Mensagens de áudio podem ser transcritas automaticamente para serem respondidas.
        </li>
        <li><b>Dados técnicos:</b> endereço IP, data e hora de acesso e informações do navegador, para segurança e funcionamento.</li>
        <li>
          <b>No seu aparelho:</b> o carrinho e o último pedido ficam salvos no armazenamento local do navegador, para você
          não perder o pedido e poder repeti-lo. Você pode apagá-los limpando os dados do site.
        </li>
      </ul>
      <p>A plataforma não processa pagamentos online nem guarda dados de cartão: o pagamento é feito diretamente ao restaurante.</p>

      <h2>3. Para que usamos</h2>
      <ul>
        <li>Registrar, preparar e entregar o seu pedido (execução de contrato — art. 7º, V, da LGPD).</li>
        <li>Enviar avisos sobre o andamento do pedido pelo WhatsApp, quando o restaurante usa esse recurso.</li>
        <li>Responder dúvidas no atendimento automático (horários, cardápio, taxas de entrega).</li>
        <li>Cumprir obrigações legais e fiscais do restaurante (art. 7º, II).</li>
        <li>Garantir a segurança da plataforma e prevenir fraudes (legítimo interesse — art. 7º, IX).</li>
      </ul>
      <p>Não vendemos seus dados e não os usamos para publicidade de terceiros.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>Somente com prestadores necessários para o serviço funcionar, sob contrato e com medidas de segurança:</p>
      <ul>
        <li>hospedagem da aplicação e banco de dados (servidores em nuvem, que podem estar fora do Brasil);</li>
        <li>infraestrutura de envio e recebimento de mensagens do WhatsApp;</li>
        <li>
          provedor de inteligência artificial (OpenAI), apenas quando o restaurante ativa o atendimento com IA, para gerar
          respostas e transcrever áudios;
        </li>
        <li>autoridades públicas, quando houver obrigação legal ou ordem judicial.</li>
      </ul>
      <p>
        Quando houver transferência internacional, ela ocorre com as garantias previstas no art. 33 da LGPD, como cláusulas
        contratuais com os fornecedores.
      </p>

      <h2>5. Por quanto tempo guardamos</h2>
      <p>
        Os dados de pedidos ficam guardados enquanto o restaurante usar a plataforma, para histórico, relatórios e
        cumprimento de obrigações legais e fiscais. Encerrado o contrato com o restaurante, os dados são excluídos ou
        anonimizados, exceto quando a lei exigir guardá-los por mais tempo. Registros técnicos de acesso são mantidos pelo
        prazo do Marco Civil da Internet (6 meses).
      </p>

      <h2>6. Seus direitos</h2>
      <p>Pela LGPD (art. 18), você pode pedir:</p>
      <ul>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;</li>
        <li>portabilidade e informação sobre com quem compartilhamos;</li>
        <li>revisão de decisões automatizadas e a oposição a tratamentos baseados em legítimo interesse.</li>
      </ul>
      <p>
        Como o restaurante é o controlador, o caminho mais rápido é falar com ele. Você também pode escrever para {CONTATO}{" "}
        e encaminharemos o pedido ao restaurante, respondendo no prazo legal. Você ainda pode reclamar à Autoridade
        Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>7. Segurança</h2>
      <p>
        Usamos conexão criptografada (HTTPS), controle de acesso por empresa (cada restaurante só vê os próprios dados),
        senhas protegidas e acesso restrito da equipe. Nenhum sistema é 100% seguro; se houver incidente relevante,
        avisaremos os restaurantes, os titulares afetados e a ANPD conforme a lei.
      </p>

      <h2>8. Cookies</h2>
      <p>
        O cardápio público não usa cookies de publicidade nem de rastreamento. O painel da equipe usa apenas cookies
        essenciais de login.
      </p>

      <h2>9. Crianças e adolescentes</h2>
      <p>O serviço não é direcionado a menores de 18 anos. Pedidos devem ser feitos por maiores ou com autorização dos responsáveis.</p>

      <h2>10. Alterações e contato</h2>
      <p>
        Podemos atualizar esta política; a data no topo indica a versão vigente. Dúvidas ou pedidos sobre dados pessoais:{" "}
        {CONTATO} (encarregado de dados).
      </p>
    </article>
  );
}
