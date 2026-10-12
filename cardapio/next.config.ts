import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /admin e /balcao viraram o /painel unificado; mantém links e atalhos antigos funcionando.
  async redirects() {
    return [
      { source: "/balcao/configurar", destination: "/painel/impressao", permanent: false },
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

export default nextConfig;
