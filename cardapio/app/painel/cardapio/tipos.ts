import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";

export type Categoria = { id: string; nome: string; ordem: number; ativo: boolean };
export type ItemEd = {
  id: string; categoria_id: string; nome: string; descricao: string | null; preco: number;
  foto_url: string | null; disponivel: boolean; destaque: boolean; ordem: number;
  ponto_carne_ativo: boolean; ponto_carne_opcoes: string[]; ponto_carne_obrigatorio: boolean;
  estoque_controlado: boolean; estoque_quantidade: number; estoque_minimo: number; estoque_indisponivel_zerado: boolean;
  rascunho?: boolean; // linha nova ainda não salva (id "tmp-…")
  k?: string;         // chave React estável: mantém a linha montada quando o rascunho ganha id real
};
export type ConfigEstoqueItem = Pick<ItemEd, "estoque_controlado" | "estoque_minimo" | "estoque_indisponivel_zerado">;

export const COLUNAS_ITEM = "id, categoria_id, nome, descricao, preco, foto_url, disponivel, destaque, ordem, ponto_carne_ativo, ponto_carne_opcoes, ponto_carne_obrigatorio";
export const MAX_DESTAQUES = 10;

// Ações do editor, passadas para categorias, linhas e drawer.
export type Ops = {
  atualizarItem: (id: string, campos: Partial<ItemEd>) => void;
  atualizarEstoqueItem: (id: string, campos: ConfigEstoqueItem) => void;
  atualizarCategoria: (id: string, campos: Partial<Categoria>) => void;
  reordenarItens: (categoriaId: string, idsEmOrdem: string[]) => void;
  novoProduto: (categoriaId: string) => void;
  descartarRascunho: (id: string) => void;
  duplicar: (item: ItemEd) => void;
  excluirItem: (item: ItemEd) => void;
  excluirCategoria: (c: Categoria) => void;
  trocarFoto: (item: ItemEd, arquivo: File) => void;
  alternarDestaque: (item: ItemEd) => void;
  editar: (id: string) => void;
  mover: (item: ItemEd) => void;
};

// Aceita "12,50", "12.50" e "1.234,50". NaN se inválido.
export function lerPreco(s: string) {
  const t = s.trim().replace(/^R\$\s*/, "");
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return t === "" ? NaN : n;
}
export const mostrarPreco = (n: number) => n.toFixed(2).replace(".", ",");

export const acessibilidadeDnd: { screenReaderInstructions: ScreenReaderInstructions; announcements: Announcements } = {
  screenReaderInstructions: {
    draggable: "Para reordenar, pressione espaço ou Enter, mova com as setas e solte com espaço ou Enter. Esc cancela.",
  },
  announcements: {
    onDragStart: () => "Item pego. Use as setas para mover.",
    onDragOver: ({ over }) => (over ? "Nova posição." : "Fora da lista."),
    onDragEnd: ({ over }) => (over ? "Item solto na nova posição." : "Item solto."),
    onDragCancel: () => "Movimento cancelado.",
  },
};

// Menus ⋮ (details/summary): classes comuns e fechar ao escolher.
export const menuItem = "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800";
export const menuCaixa = "absolute right-0 z-20 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900";
export const fecharMenu = (el: HTMLElement) => { el.closest("details")!.open = false; };
