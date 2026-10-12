// Áreas da equipe seguem o tema do sistema (claro/escuro). Ver @custom-variant dark em globals.css.
export function TemaAuto({ children }: { children: React.ReactNode }) {
  return <div className="tema-auto flex min-h-dvh flex-1 flex-col">{children}</div>;
}
