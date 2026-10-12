// Espelha a constraint empresas_slug_valido do schema.sql (o banco é quem garante).
export const SLUGS_RESERVADOS = ["admin", "login", "api", "balcao", "garcom", "pedido", "painel", "_next", "icons"];

export function erroSlug(slug: string): string | null {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return "O endereço deve ter de 3 a 40 caracteres: letras minúsculas, números e hífen.";
  if (SLUGS_RESERVADOS.includes(slug)) return `"${slug}" é reservado pelo sistema. Escolha outro endereço.`;
  return null;
}
