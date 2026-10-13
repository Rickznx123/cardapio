import { TemaAuto } from "@/components/tema-auto";
import { Toaster } from "@/components/toast";

export const metadata = { title: "Super admin · Cardápio Digital", robots: { index: false } };

export default function Layout({ children }: LayoutProps<"/superadmin">) {
  return (
    <TemaAuto>
      {children}
      <Toaster />
    </TemaAuto>
  );
}
