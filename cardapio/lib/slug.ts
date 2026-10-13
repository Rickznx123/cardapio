// Espelha a constraint empresas_slug_valido do schema.sql (o banco é quem garante).
export const SLUGS_RESERVADOS = [
  "admin", "login", "api", "balcao", "garcom", "pedido", "painel", "_next", "icons",
  "superadmin", "termos", "privacidade", "redefinir-senha", "cadastro", "opengraph-image",
];

export function erroSlug(slug: string): string | null {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return "O endereço deve ter de 3 a 40 caracteres: letras minúsculas, números e hífen.";
  if (SLUGS_RESERVADOS.includes(slug)) return `"${slug}" é reservado pelo sistema. Escolha outro endereço.`;
  return null;
}

// "Lanchonete do Zé & Cia" → "lanchonete-do-ze-cia"
export const gerarSlug = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
