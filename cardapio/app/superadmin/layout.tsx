import { TemaAuto } from "@/components/tema-auto";
import { Toaster } from "@/components/toast";
import { PRODUTO } from "@/lib/marca";

export const metadata = { title: `Super admin · ${PRODUTO}`, robots: { index: false } };

export default function Layout({ children }: LayoutProps<"/superadmin">) {
  return (
    <TemaAuto>
      {children}
      <Toaster />
    </TemaAuto>
  );
}
