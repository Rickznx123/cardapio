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
- **Pedidos só são criados via RPC** (`criar_pedido_publico`, `criar_pedido_mesa`). Preço nunca vem do client.
- Mobile-first em tudo (cardápio e app do garçom são usados no celular).
- Fotos: comprimir no client antes do upload (máx ~1200px, webp). Caminho: `{empresa_id}/arquivo.webp`.
- Carrinho (público e garçom) é uma lista de **linhas** com id próprio (`lib/linhas.ts`): o mesmo item pode ter
  várias linhas com observações diferentes. Cada linha vira um elemento de `p_itens`.
- Slug: `^[a-z0-9-]{3,40}$`, sem palavras reservadas (constraint `empresas_slug_valido`; lista espelhada em `lib/slug.ts`).
- Cancelar pedido só via RPC `cancelar_pedido` (desconta da comanda aberta). Update direto para `cancelado` é barrado pela RLS (with check).
- Texto vindo de cliente/garçom no cupom sempre passa por escape (`lib/cupom.ts`).

## Áreas / rotas
| Rota | Quem usa | O quê |
|---|---|---|
| `/[slug]` | cliente | cardápio público, carrinho, entrega (taxa por bairro) ou retirada |
| `/[slug]/pedido/[id]` | cliente | confirmação via RPC `ver_pedido_publico` (status atualiza a cada 20s) + botão WhatsApp |
| `/login` | dono/caixa | login por e-mail/senha |
| `/admin` | dono | empresa, categorias, itens, bairros/taxas, mesas, equipe (garçom e caixa) |
| `/[slug]/garcom` | garçom | PWA: login nome+PIN; grade de mesas → comanda → adicionar itens (obs. por item) → enviar |
| `/[slug]/garcom/manifest` | — | manifest do PWA por empresa (`start_url` = `/[slug]/garcom`) |
| `/balcao` | caixa/dono | colunas novo → preparo → pronto → entregue, cancelar, impressão automática/reimprimir; aba Mesas: imprimir conta, fechar comanda |
| `/balcao/configurar` | caixa/dono | instruções do atalho do Chrome com `--kiosk-printing` no Windows |
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
- `/balcao` escuta `pedidos` no Realtime filtrado por `empresa_id`. No evento, busca pedido + itens pelo id
  (o payload do INSERT vem com total 0 e sem itens). Se o canal cair, reconecta em 3s e refaz o fetch completo.
- Antes de imprimir, "reivindica": `update pedidos set impresso_em = now() where id = X and impresso_em is null`;
  só imprime se voltou linha (evita duplicar com duas abas). Toggle "impressão automática" no localStorage.
- Impressão em iframe oculto (`lib/impressao.ts`, sandbox sem scripts), uma por vez.
- Produção: Chrome com `--kiosk-printing` (ver `/balcao/configurar`). Em dev, testar com "Salvar como PDF".

## Plano de build
- **Dia 1:** setup, auth, layout, admin completo (CRUDs + upload de fotos)
- **Dia 2:** cardápio público + checkout com bairros; app do garçom (PWA)
- **Dia 3:** painel do balcão realtime, cupom + impressão, testes ponta a ponta, deploy

## Migrations (rodar em ordem no SQL Editor, em bancos já criados)
- `002_garcom.sql`: RPC `listar_garcons`
- `003_dia3.sql`: constraint de slug, RPCs `ver_pedido_publico` e `cancelar_pedido`
- `004_seguranca.sql`: policy de update em `pedidos` bloqueia `cancelado`; `ver_pedido_publico(p_slug, p_id)`
