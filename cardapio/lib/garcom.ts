// Troque aqui para mudar o domínio dos e-mails sintéticos dos garçons.
export const GARCOM_EMAIL_DOMAIN = "garcom.example.com";

// E-mail sintético do garçom: {nome}.{slug}@GARCOM_EMAIL_DOMAIN. Nunca é mostrado ao client.
export function emailGarcom(nome: string, slug: string) {
  const n = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${n}.${slug}@${GARCOM_EMAIL_DOMAIN}`;
}
