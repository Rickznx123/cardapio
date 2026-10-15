import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // /admin e /balcao viraram o /painel unificado; mantém links e atalhos antigos funcionando.
  async redirects() {
    return [
      { source: "/balcao/configurar", destination: "/painel?secao=impressao", permanent: false },
      { source: "/painel/impressao", destination: "/painel?secao=impressao", permanent: false },
      { source: "/painel/assinatura", destination: "/painel?secao=assinatura", permanent: false }, // back_url do Mercado Pago
      { source: "/balcao/:path*", destination: "/painel", permanent: false },
      { source: "/admin/:path*", destination: "/painel", permanent: false },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Source maps só sobem para o Sentry com SENTRY_AUTH_TOKEN (+ SENTRY_ORG e SENTRY_PROJECT) no ambiente de build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  silent: !process.env.CI,
  telemetry: false,
});
