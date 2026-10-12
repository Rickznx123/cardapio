import { TemaAuto } from "@/components/tema-auto";
import { Toaster } from "@/components/toast";

export default function Layout({ children }: LayoutProps<"/login">) {
  return (
    <TemaAuto>
      {children}
      <Toaster />
    </TemaAuto>
  );
}
