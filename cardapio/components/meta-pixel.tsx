"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { SLUGS_RESERVADOS } from "@/lib/slug";

declare global { interface Window { fbq?: (...args: unknown[]) => void } }

const PIXEL_ID = "1745631853332923";

// Só nas páginas da plataforma: os cardápios das lojas (/[slug]) não levam o pixel.
const plataforma = (pathname: string) => {
  const seg = pathname.split("/")[1];
  return seg === "" || SLUGS_RESERVADOS.includes(seg);
};

// Usa useSearchParams: renderizar dentro de <Suspense>.
// Botões com data-fbq="Lead" | "ViewContent" disparam o evento no clique (funciona em server components).
export function MetaPixel() {
  const pathname = usePathname();
  const url = `${pathname}?${useSearchParams()}`;
  const ativo = plataforma(pathname);
  // Começa com a URL atual: o PageView do carregamento vem do script; aqui só as trocas de rota.
  const ultima = useRef(url);

  useEffect(() => {
    if (url === ultima.current) return;
    ultima.current = url;
    if (ativo) window.fbq?.("track", "PageView");
  }, [url, ativo]);

  if (!ativo) return null;
  // disablePushState: o fbevents.js não manda PageView sozinho no history.pushState (quem manda é o efeito acima).
  return (
    <Script id="meta-pixel" strategy="afterInteractive">{`
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq.disablePushState=true;
fbq('init','${PIXEL_ID}');fbq('track','PageView');
document.addEventListener('click',function(e){var el=e.target.closest&&e.target.closest('[data-fbq]');if(!el)return;
var ev=el.getAttribute('data-fbq');fbq('track',ev,ev==='Lead'?{value:149.90,currency:'BRL'}:undefined)},true);
`}</Script>
  );
}
