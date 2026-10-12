// Linhas do carrinho (cardápio público e garçom): o mesmo item pode ter várias linhas com observações diferentes.
export type LinhaCarrinho = { id: string; item_id: string; quantidade: number; observacao: string };

// crypto.randomUUID não existe fora de HTTPS (ex.: testar no celular via IP da rede).
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// Toque em "Adicionar": soma na linha sem observação do item, ou cria uma.
export function adicionar(linhas: LinhaCarrinho[], item_id: string): LinhaCarrinho[] {
  const livre = linhas.find((l) => l.item_id === item_id && !l.observacao.trim());
  return livre ? mudarQtd(linhas, livre.id, 1) : novaLinha(linhas, item_id);
}

// "+ adicionar com outra observação": sempre uma linha nova.
export const novaLinha = (linhas: LinhaCarrinho[], item_id: string): LinhaCarrinho[] => [
  ...linhas,
  { id: novoId(), item_id, quantidade: 1, observacao: "" },
];

export const mudarQtd = (linhas: LinhaCarrinho[], id: string, delta: number) =>
  linhas.map((l) => (l.id === id ? { ...l, quantidade: l.quantidade + delta } : l)).filter((l) => l.quantidade > 0);

export const mudarObs = (linhas: LinhaCarrinho[], id: string, observacao: string) =>
  linhas.map((l) => (l.id === id ? { ...l, observacao } : l));

// Formato do p_itens das RPCs de pedido.
export const paraRpc = (linhas: LinhaCarrinho[]) =>
  linhas.map((l) => ({ item_id: l.item_id, quantidade: l.quantidade, observacao: l.observacao.trim() }));
