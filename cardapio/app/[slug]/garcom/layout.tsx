import { TemaAuto } from "@/components/tema-auto";
import { Toaster } from "@/components/toast";

export default function Layout({ children }: LayoutProps<"/[slug]/garcom">) {
  return (
    <TemaAuto>
      {children}
      <Toaster />
    </TemaAuto>
  );
}
