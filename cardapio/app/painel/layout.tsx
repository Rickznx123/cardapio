import { TemaAuto } from "@/components/tema-auto";
import { Toaster } from "@/components/toast";
import { MetaPixel } from "@/components/meta-pixel";

export default function Layout({ children }: LayoutProps<"/painel">) {
  return (
    <TemaAuto>
      {children}
      <Toaster />
      <MetaPixel />
    </TemaAuto>
  );
}
