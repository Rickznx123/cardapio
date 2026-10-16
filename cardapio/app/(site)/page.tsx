import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BarChart3, Bike, Bot, CircleCheck, ClipboardList, Printer, QrCode, Smartphone, Sparkles, Store, UtensilsCrossed,
} from "lucide-react";
import { linkVendas, PRODUTO } from "@/lib/marca";
import { CONFIGURACAO_INCLUSA, DIAS_TRIAL, INCLUI, PRECO_MENSAL } from "@/lib/planos";
import { brl } from "@/lib/tipos";

const TITULO = `${PRODUTO}: cardápio digital e pedidos sem taxa por pedido`;
const DESCRICAO = "Cardápio online, delivery com taxa por bairro, app do garçom, impressão automática e chatbot no WhatsApp. "
  + `Mensalidade fixa, pedidos ilimitados. Teste grátis por ${DIAS_TRIAL} dias.`;

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/" },
  openGraph: { title: TITULO, description: DESCRICAO, type: "website", locale: "pt_BR", siteName: PRODUTO, url: "/" },
};

const CTA = `Testar grátis por ${DIAS_TRIAL} dias`;
const botaoSecundario = "inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-neutral-300 bg-white px-7 text-lg font-semibold hover:bg-neutral-50";

const PASSOS = [
  { Icone: UtensilsCrossed, titulo: "Cadastre o cardápio", texto: "Crie sua conta e adicione itens, fotos e preços. Leva poucos minutos." },
  { Icone: QrCode, titulo: "Compartilhe o link e o QR", texto: "Mande o link no WhatsApp e no Instagram e cole o QR Code nas mesas." },
  { Icone: Printer, titulo: "Receba e imprima", texto: "Os pedidos chegam na hora no painel e o cupom sai impresso sozinho." },
];

const RECURSOS = [
  { Icone: Smartphone, titulo: "Cardápio digital", texto: "Fotos, busca, destaques e carrinho. Abre no celular do cliente, sem baixar app." },
  { Icone: CircleCheck, titulo: "Pedidos ilimitados, sem taxa", texto: "Mensalidade fixa. Venda 10 ou 10 mil pedidos e pague o mesmo valor." },
  { Icone: Bike, titulo: "Delivery com taxa por bairro", texto: "Taxa e pedido mínimo por bairro, troco e forma de pagamento já no pedido." },
  { Icone: ClipboardList, titulo: "App do garçom", texto: "Pedido da mesa lançado pelo celular, comanda aberta e fechamento da conta." },
  { Icone: Printer, titulo: "Impressão automática", texto: "Cupom na impressora térmica assim que o pedido chega, com via da cozinha." },
  { Icone: BarChart3, titulo: "Caixa e relatórios", texto: "Abertura e fechamento de caixa, sangria, histórico e relatório de vendas." },
  { Icone: Bot, titulo: "Chatbot no WhatsApp", texto: "Responde horários e dúvidas, manda o link do cardápio e avisa o status do pedido." },
];

const FAQ = [
  ["Preciso de impressora?", "Sim. É necessária uma impressora térmica de 58 ou 80 mm ligada a um computador para imprimir os pedidos. A instalação está inclusa na configuração."],
  ["Preciso cadastrar tudo sozinho?", "Não. A configuração completa está inclusa no plano: cadastramos seu cardápio e as fotos, geramos os QR Codes das mesas e instalamos a impressora. Sem taxa de setup."],
  ["Funciona no celular?", "Sim. O cardápio do cliente, o app do garçom e o painel funcionam no navegador do celular, sem instalar nada."],
  ["Tem fidelidade?", "Não. O plano é mensal e você usa enquanto fizer sentido para o seu negócio."],
  ["Posso cancelar quando quiser?", "Pode. É só avisar pelo WhatsApp; não há multa."],
  ["Vocês cobram porcentagem dos pedidos?", "Não. A mensalidade é fixa e os pedidos são ilimitados. O dinheiro das vendas vai direto para você."],
  [`O que acontece depois dos ${DIAS_TRIAL} dias de teste?`, "Se gostar, é só assinar e tudo continua como está. Se não assinar, o cardápio fica indisponível, mas nada do que você cadastrou é apagado."],
] as const;

// Comparação ilustrativa com comissão de apps de delivery.
// Botão principal: o dono pede para a gente configurar e já assinar (WhatsApp de vendas, mensagem pronta).
const MENSAGEM_CONFIGURAR = `Olá! Quero que vocês configurem meu cardápio digital e já assinar o ${PRODUTO}. Meu estabelecimento é: `;
const APOIO = "A gente cadastra seu cardápio, fotos e QR Codes pra você. É só assinar e começar a vender.";
// Verde escuro: branco sobre o verde oficial (#25D366) fica ilegível (contraste 2:1).
const botaoWhats = "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl text-center bg-emerald-700 px-6 py-3 text-lg font-bold text-white shadow-lg shadow-emerald-700/20 hover:bg-emerald-800 sm:w-auto";

function IconeWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function QueroConfigurar({ className = "" }: { className?: string }) {
  return (
    <a href={linkVendas(MENSAGEM_CONFIGURAR)} data-fbq="Lead" target="_blank" rel="noopener noreferrer" className={`${botaoWhats} ${className}`}>
      <IconeWhatsApp className="size-6 shrink-0" /> QUERO CONFIGURAR MEU CARDÁPIO
    </a>
  );
}

const PEDIDOS_MES = 300;
const TICKET = 40;
const comissao = (p: number) => brl(PEDIDOS_MES * TICKET * p);

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-white text-neutral-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 p-4">
        <span className="flex items-center gap-2 font-bold text-rose-600">
          <UtensilsCrossed className="size-6" /> {PRODUTO}
        </span>
        <nav className="flex items-center gap-1 text-sm font-semibold">
          <a href="#planos" className="hidden rounded-lg px-3 py-2 hover:bg-neutral-100 sm:block">Preço</a>
          <Link href="/login" className="rounded-lg px-3 py-2 hover:bg-neutral-100">Entrar</Link>
          <Link href="/cadastro" className="rounded-lg bg-rose-600 px-3 py-2 text-white hover:bg-rose-700">Teste grátis</Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-8 pb-16 md:grid-cols-2 md:pt-16">
          <div className="text-center md:text-left">
            <p className="mb-3 inline-block rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700">Para lanchonetes, pizzarias e restaurantes</p>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Receba pedidos online <span className="text-rose-600">sem pagar taxa por pedido</span>
            </h1>
            <p className="mt-5 text-lg text-neutral-600 text-pretty">
              Cardápio digital, delivery, mesas e balcão num só lugar. Mensalidade fixa de {brl(PRECO_MENSAL)} e pedidos ilimitados.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center md:justify-start">
              <QueroConfigurar />
              <Link href="/cadastro" className={`${botaoSecundario} w-full sm:w-auto`}>{CTA} <ArrowRight className="size-5" /></Link>
            </div>
            <p className="mt-3 text-sm text-neutral-600">{APOIO}</p>
          </div>
          <Mockups />
        </section>

        <section className="bg-neutral-50 py-16" aria-labelledby="como">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="como" className="text-center text-3xl font-bold">Como funciona</h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-3">
              {PASSOS.map(({ Icone, titulo, texto }, i) => (
                <li key={titulo} className="rounded-2xl bg-white p-6 shadow-sm">
                  <span className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full bg-rose-600 font-bold text-white">{i + 1}</span>
                    <Icone className="size-6 text-rose-600" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{titulo}</h3>
                  <p className="mt-1 text-neutral-600">{texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-16" aria-labelledby="recursos">
          <div className="mx-auto max-w-6xl px-4">
            <h2 id="recursos" className="text-center text-3xl font-bold">Tudo o que sua loja precisa</h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RECURSOS.map(({ Icone, titulo, texto }) => (
                <li key={titulo} className="rounded-2xl border border-neutral-200 p-6">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Icone className="size-6" /></span>
                  <h3 className="mt-4 text-lg font-semibold">{titulo}</h3>
                  <p className="mt-1 text-neutral-600">{texto}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="planos" className="scroll-mt-4 bg-neutral-50 py-16" aria-labelledby="titulo-planos">
          <div className="mx-auto grid max-w-5xl items-start gap-6 px-4 md:grid-cols-2">
            <div className="rounded-3xl border-2 border-rose-600 bg-white p-6 shadow-sm sm:p-8">
              <h2 id="titulo-planos" className="text-2xl font-bold">Plano completo</h2>
              <p className="mt-4"><span className="text-5xl font-black tabular-nums">{brl(PRECO_MENSAL)}</span><span className="text-neutral-500">/mês</span></p>
              <p className="mt-1 font-medium text-emerald-700">Pedidos ilimitados. Sem taxa por pedido. Sem fidelidade.</p>
              <ul className="mt-6 space-y-2">
                {INCLUI.map((i) => <li key={i} className="flex gap-2"><CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" /> {i}</li>)}
              </ul>
              <QueroConfigurar className="mt-8 sm:w-full" />
              <p className="mt-3 text-center text-sm">
                <Link href="/cadastro" className="font-semibold text-rose-700 underline underline-offset-2 hover:text-rose-800">ou teste grátis sozinho</Link>
              </p>
              <p className="mt-4 flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-900">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {CONFIGURACAO_INCLUSA}, sem custo extra.
              </p>
            </div>
            <div className="space-y-4 p-2 md:pt-6">
              <h3 className="text-2xl font-bold">Faça a conta</h3>
              <p className="text-neutral-600">
                Apps de delivery costumam cobrar de 12% a 27% de comissão por pedido. Com {PEDIDOS_MES} pedidos de {brl(TICKET)} por mês:
              </p>
              <dl className="divide-y divide-neutral-200 rounded-2xl bg-white shadow-sm">
                <div className="flex justify-between gap-4 p-4"><dt>Comissão de 12%</dt><dd className="font-semibold text-red-600 tabular-nums">{comissao(0.12)}/mês</dd></div>
                <div className="flex justify-between gap-4 p-4"><dt>Comissão de 27%</dt><dd className="font-semibold text-red-600 tabular-nums">{comissao(0.27)}/mês</dd></div>
                <div className="flex justify-between gap-4 p-4 text-lg"><dt className="font-semibold">{PRODUTO}</dt><dd className="font-black text-emerald-700 tabular-nums">{brl(PRECO_MENSAL)}/mês</dd></div>
              </dl>
              <p className="text-sm text-neutral-500">Valores ilustrativos. A comissão varia conforme o app e o plano contratado.</p>
            </div>
          </div>
        </section>

        <section className="py-16" aria-labelledby="faq">
          <div className="mx-auto max-w-3xl px-4">
            <h2 id="faq" className="text-center text-3xl font-bold">Perguntas frequentes</h2>
            <div className="mt-8 divide-y divide-neutral-200 rounded-2xl border border-neutral-200">
              {FAQ.map(([p, r]) => (
                <details key={p} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {p} <span className="text-2xl leading-none text-rose-600 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-neutral-600">{r}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16">
          <div className="mx-auto max-w-5xl rounded-3xl bg-rose-600 px-6 py-12 text-center text-white">
            <h2 className="text-3xl font-bold text-balance">Seu cardápio no ar ainda hoje</h2>
            <p className="mt-3 text-rose-100">{APOIO}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
              <QueroConfigurar />
              <Link href="/cadastro" className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-7 text-lg font-semibold text-rose-700 hover:bg-rose-50 sm:w-auto">
                {CTA} <ArrowRight className="size-5" />
              </Link>
            </div>
            <p className="mt-4 text-sm text-rose-100">{DIAS_TRIAL} dias grátis com tudo liberado. Sem cartão de crédito.</p>
          </div>
        </section>
      </main>

      <a href={linkVendas(MENSAGEM_CONFIGURAR)} data-fbq="Lead" target="_blank" rel="noopener noreferrer" aria-label="Falar com a gente no WhatsApp"
        className="fixed right-4 bottom-4 z-50 flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xl shadow-emerald-900/30 hover:bg-emerald-700 sm:right-6 sm:bottom-6">
        <IconeWhatsApp className="size-8" />
      </a>

      {/* pb extra no celular: o botão flutuante não cobre os links do rodapé. */}
      <footer className="border-t border-neutral-200 p-6 pb-24 text-center text-sm text-neutral-500 sm:pb-6">
        © {PRODUTO} · <Link href="/termos" className="hover:underline">Termos de uso</Link> ·{" "}
        <Link href="/privacidade" className="hover:underline">Privacidade</Link> · <Link href="/login" className="hover:underline">Entrar</Link>
      </footer>
    </div>
  );
}

// Celular com o cardápio + painel de pedidos atrás (só HTML/CSS, sem imagem).
function Mockups() {
  const itens = [["X-Burguer", "R$ 24,90"], ["X-Salada", "R$ 27,90"], ["Batata frita", "R$ 18,00"], ["Refrigerante lata", "R$ 6,00"]];
  const pedidos = [["#128", "Delivery", "Novo", "bg-rose-600 text-white"], ["#127", "Mesa 4", "Em preparo", "bg-amber-400"], ["#126", "Balcão", "Pronto", "bg-emerald-600 text-white"]];
  return (
    <div className="relative mx-auto h-[26rem] w-full max-w-md" aria-hidden>
      <div className="absolute top-6 right-0 hidden w-80 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl sm:block">
        <p className="flex items-center gap-2 text-sm font-bold"><Store className="size-4 text-rose-600" /> Pedidos · hoje</p>
        <ul className="mt-3 space-y-2">
          {pedidos.map(([n, tipo, status, cor]) => (
            <li key={n} className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <span className="font-black">{n}</span><span className="text-neutral-500">{tipo}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${cor}`}>{status}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-500"><Printer className="size-3.5" /> Impressão automática ligada</p>
      </div>
      <div className="absolute top-0 left-1/2 w-56 -translate-x-1/2 overflow-hidden rounded-[2.2rem] border-[7px] border-neutral-900 bg-white shadow-2xl sm:left-2 sm:translate-x-0">
        <div className="h-16 bg-gradient-to-br from-rose-500 to-orange-400" />
        <div className="px-3 pb-4">
          <div className="-mt-6 size-12 rounded-full bg-white p-1 shadow"><div className="size-full rounded-full bg-rose-600" /></div>
          <p className="mt-1 font-bold">Lanchonete do Zé</p>
          <p className="text-[11px] font-semibold text-emerald-700">● Aberto · entrega 30–45 min</p>
          <ul className="mt-3 space-y-2">
            {itens.map(([nome, preco]) => (
              <li key={nome} className="flex items-center gap-2 rounded-xl border border-neutral-200 p-2">
                <span className="size-9 shrink-0 rounded-lg bg-gradient-to-br from-amber-200 to-orange-300" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{nome}</span>
                <span className="text-xs font-bold">{preco}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl bg-rose-600 py-2 text-center text-xs font-bold text-white">Ver carrinho · R$ 52,80</p>
        </div>
      </div>
    </div>
  );
}
