# Cardápio Digital — contexto do projeto

SaaS multi-tenant de cardápio digital para pequenos restaurantes/lanchonetes no Brasil.
Interface 100% em português (pt-BR), valores em R$.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- Supabase: Postgres, Auth, Storage (bucket `fotos`), Realtime
- `@supabase/ssr` para auth no server
- Deploy: Vercel
- Banco já definido em `schema.sql` (fonte da verdade — não alterar sem pedir).
  Mudanças posteriores também vão em `migrations/NNN_nome.sql` (só o delta, para bancos já criados).
- App Next fica em `cardapio/` (Next 16: middleware se chama `proxy.ts`; `cacheComponents` ligado,
  então acesso a `params`/`useParams`/cookies precisa estar dentro de `<Suspense>`).

## Regras importantes
- Todo dado é isolado por `empresa_id` via RLS. Nunca usar service role no client.
- **Pedidos só são criados via RPC** (`criar_pedido_publico` → origem `web`, `criar_pedido_mesa` → `garcom`,
  `criar_pedido_balcao` → `balcao`). Preço nunca vem do client. Web e balcão compartilham a validação de
  bairro/taxa/mínimo/troco em `_criar_pedido_externo` (interna, sem grant).
- Pagamento: `forma_pagamento` (obrigatória no web), `troco_para` (só dinheiro, ≥ total), `pago`/`pago_em`.
  Fechar comanda só via RPC `fechar_comanda(p_comanda_id, p_forma_pagamento)` (marca os pedidos da mesa como pagos).
- Mobile-first em tudo (cardápio e app do garçom são usados no celular).
- Fotos: comprimir no client antes do upload (máx ~1200px, webp). Caminho: `{empresa_id}/arquivo.webp`.
- Carrinho (público e garçom) é uma lista de **linhas** com id próprio (`lib/linhas.ts`): o mesmo item pode ter
  várias linhas com observações diferentes. Cada linha vira um elemento de `p_itens`.
- Slug: `^[a-z0-9-]{3,40}$`, sem palavras reservadas (constraint `empresas_slug_valido`; lista espelhada em `lib/slug.ts`).
- Cancelar pedido só via RPC `cancelar_pedido` (desconta da comanda aberta). Update direto para `cancelado` é barrado pela RLS (with check).
- Texto vindo de cliente/garçom no cupom sempre passa por escape (`lib/cupom.ts`).
- Editor do cardápio (`app/painel/cardapio/`) salva sozinho e de forma otimista: atualiza a tela, grava no
  banco e, se falhar, desfaz só os campos alterados + toast de erro. Produto novo é rascunho local até ter nome e preço.
- Destaques: máx. 10 por empresa, garantido no banco (trigger); no cardápio só aparecem os disponíveis de categorias visíveis.

## Áreas / rotas
| Rota | Quem usa | O quê |
|---|---|---|
| `/` | visitante | landing do produto + "Entrar" |
| `/[slug]` | cliente | cardápio: capa, informações, busca, último pedido (repetir), carrinho, checkout com pagamento/troco |
| `/[slug]/pedido/[id]` | cliente | confirmação via RPC `ver_pedido_publico` (status atualiza a cada 20s) + botão WhatsApp |
| `/login` | dono/caixa | login por e-mail/senha → `/painel` |
| `/painel` | dono/caixa | painel unificado (substitui `/admin` e `/balcao`). Seções: Pedidos (abas Balcão/Delivery/Mesas, filtros, novo pedido, pagar, finalizar, comandas), Cardápio (editor único "editar no lugar": capa/logo/nome, categorias e itens com arrastar via @dnd-kit, destaques, drawer do item), Mesas, Entrega, Equipe, Configurações. Caixa vê só Pedidos. Sidebar: loja aberta/fechada, ver cardápio, QR Code |
| `/painel/impressao` | dono/caixa | instruções do atalho do Chrome com `--kiosk-printing` no Windows |
| `/admin`, `/balcao`, `/balcao/configurar` | — | redirects (next.config) para `/painel` e `/painel/impressao` |
| `/[slug]/garcom` | garçom | PWA: login nome+PIN; grade de mesas → comanda → adicionar itens (obs. por item) → enviar |
| `/[slug]/garcom/manifest` | — | manifest do PWA por empresa (`start_url` = `/[slug]/garcom`) |
| `POST /api/garcom` | dono | cadastra garçom (nome + PIN) ou caixa (nome + e-mail + senha) |
| `POST /api/garcom/login` | garçom | `{membro_id, pin}` → login no server, grava cookies de sessão |

## Login do garçom
Dono cadastra o garçom: cria usuário no Supabase Auth com e-mail gerado
(`{nome}.{slug}@GARCOM_EMAIL_DOMAIN`, constante em `lib/garcom.ts`) e senha = PIN de 6 dígitos.
Criação via Route Handler com service role (server only), validando que quem chama é dono.
Em `/[slug]/garcom` a lista de nomes vem da RPC `listar_garcons(p_slug)` (só id e nome).
O garçom escolhe o nome e digita o PIN; `/api/garcom/login` busca o e-mail com o admin client e faz
`signInWithPassword` no server. O e-mail nunca vai para o client. Caixa usa e-mail/senha normal no `/login`.

## Impressão
- Cupom em HTML com `@page { size: 80mm auto; margin: 0 }`, fonte monoespaçada (`lib/cupom.ts`: `cupomPedido`, `preConta`).
- `/painel` (seção Pedidos, sempre montada mesmo em outras seções) escuta `pedidos` no Realtime filtrado por `empresa_id`. No evento, busca pedido + itens pelo id
  (o payload do INSERT vem com total 0 e sem itens). Se o canal cair, reconecta em 3s e refaz o fetch completo.
- Antes de imprimir, "reivindica": `update pedidos set impresso_em = now() where id = X and impresso_em is null`;
  só imprime se voltou linha (evita duplicar com duas abas). Toggle "impressão automática" no localStorage.
- Impressão em iframe oculto (`lib/impressao.ts`, sandbox sem scripts), uma por vez.
- O cupom traz forma de pagamento, troco ("levar de troco") e PAGO/NÃO PAGO.
- Produção: Chrome com `--kiosk-printing` (ver `/painel/impressao`). Em dev, testar com "Salvar como PDF".

## Plano de build
- **Dia 1:** setup, auth, layout, admin completo (CRUDs + upload de fotos)
- **Dia 2:** cardápio público + checkout com bairros; app do garçom (PWA)
- **Dia 3:** painel do balcão realtime, cupom + impressão, testes ponta a ponta, deploy

## Migrations (rodar em ordem no SQL Editor, em bancos já criados)
- `002_garcom.sql`: RPC `listar_garcons`
- `003_dia3.sql`: constraint de slug, RPCs `ver_pedido_publico` e `cancelar_pedido`
- `004_seguranca.sql`: policy de update em `pedidos` bloqueia `cancelado`; `ver_pedido_publico(p_slug, p_id)`
- `005_painel.sql`: enums `forma_pagamento`/`origem_pedido`; colunas de pagamento/origem em `pedidos`;
  `capa_url`/`descricao`/`horario_texto` em `empresas`; slug `painel` reservado; `criar_pedido_publico` com
  pagamento; `criar_pedido_balcao`; `fechar_comanda`; `ver_pedido_publico` devolve pagamento
- `006_destaques.sql`: `itens.destaque` + trigger `itens_limite_destaques` (máx. 10 por empresa)
