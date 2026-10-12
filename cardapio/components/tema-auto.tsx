// Áreas da equipe seguem o tema do sistema (claro/escuro). Ver @custom-variant dark em globals.css.
// --cor/--cor-texto: destaque dos componentes compartilhados com o cardápio (lá é a cor da loja).
const vars = { "--cor": "#e11d48", "--cor-texto": "#ffffff" } as React.CSSProperties;

export function TemaAuto({ children }: { children: React.ReactNode }) {
  return <div style={vars} className="tema-auto flex min-h-dvh flex-1 flex-col">{children}</div>;
}
