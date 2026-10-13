// (66) 99999-9999 enquanto digita.
export function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d && `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Número do WhatsApp a partir do telefone digitado pelo cliente (acrescenta 55 se vier só DDD + número).
export function numeroWhats(telefone: string | null) {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

export function linkWhatsApp(telefone: string | null) {
  const n = numeroWhats(telefone);
  return n && `https://wa.me/${n}`;
}
