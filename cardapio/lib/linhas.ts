// Linhas do carrinho (cardápio público e garçom): o mesmo item pode ter várias linhas com observações diferentes.
export type LinhaCarrinho = {
  id: string; item_id: string; quantidade: number; observacao: string; ponto_carne?: string | null;
};

// crypto.randomUUID não existe fora de HTTPS (ex.: testar no celular via IP da rede).
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

// Toque em "Adicionar": soma na linha sem observação do item, ou cria uma.
export const adicionar = (linhas: LinhaCarrinho[], item_id: string) => adicionarCom(linhas, item_id, 1, "", null);

// Bottom sheet: soma na linha com a mesma observação, ou cria uma.
export function adicionarCom(
  linhas: LinhaCarrinho[], item_id: string, quantidade: number, observacao: string, ponto_carne: string | null = null,
): LinhaCarrinho[] {
  const obs = observacao.trim();
  const igual = linhas.find((l) =>
    l.item_id === item_id && l.observacao.trim() === obs && (l.ponto_carne ?? null) === ponto_carne,
  );
  return igual
    ? mudarQtd(linhas, igual.id, quantidade)
    : [...linhas, { id: novoId(), item_id, quantidade, observacao: obs, ponto_carne }];
}

// "+ adicionar com outra observação": sempre uma linha nova.
export const novaLinha = (linhas: LinhaCarrinho[], item_id: string): LinhaCarrinho[] => [
  ...linhas,
  { id: novoId(), item_id, quantidade: 1, observacao: "", ponto_carne: null },
];

export const novaLinhaComPonto = (linhas: LinhaCarrinho[], linha: LinhaCarrinho): LinhaCarrinho[] => [
  ...linhas,
  { id: novoId(), item_id: linha.item_id, quantidade: 1, observacao: "", ponto_carne: linha.ponto_carne ?? null },
];

export const mudarQtd = (linhas: LinhaCarrinho[], id: string, delta: number) =>
  linhas.map((l) => (l.id === id ? { ...l, quantidade: l.quantidade + delta } : l)).filter((l) => l.quantidade > 0);

export const mudarObs = (linhas: LinhaCarrinho[], id: string, observacao: string) =>
  linhas.map((l) => (l.id === id ? { ...l, observacao } : l));

// Formato do p_itens das RPCs de pedido.
export const paraRpc = (linhas: LinhaCarrinho[]) =>
  linhas.map((l) => ({
    item_id: l.item_id, quantidade: l.quantidade, observacao: l.observacao.trim(), ponto_carne: l.ponto_carne ?? null,
  }));
