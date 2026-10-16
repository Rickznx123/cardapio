import Script from "next/script";

declare global { interface Window { fbq?: (...args: unknown[]) => void } }

const PIXEL_ID = "1745631853332923";

// Só nas páginas da plataforma (landing, cadastro, painel): os cardápios das lojas não levam o pixel.
// Botões com data-fbq="Lead" | "ViewContent" disparam o evento no clique (funciona em server components).
export function MetaPixel() {
  return (
    <Script id="meta-pixel" strategy="afterInteractive">{`
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${PIXEL_ID}');fbq('track','PageView');
document.addEventListener('click',function(e){var el=e.target.closest&&e.target.closest('[data-fbq]');if(!el)return;
var ev=el.getAttribute('data-fbq');fbq('track',ev,ev==='Lead'?{value:149.90,currency:'BRL'}:undefined)},true);
`}</Script>
  );
}
