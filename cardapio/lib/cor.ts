// Texto preto ou branco sobre a cor da empresa, pelo contraste (WCAG luminância relativa).
export function corTexto(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contraste com branco = 1.05/(lum+0.05); com preto = (lum+0.05)/0.05. Escolhe o maior.
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

// Variáveis CSS de destaque: use bg-(--cor) text-(--cor-texto), text-(--cor), border-(--cor).
export const varsCor = (cor: string | null) => {
  const c = cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor : "#E11D48";
  return { "--cor": c, "--cor-texto": corTexto(c) } as React.CSSProperties;
};
