import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/marca";

// Landing, cadastro e cardápios das lojas indexáveis; áreas logadas e páginas por pedido não.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/painel", "/superadmin", "/api/", "/login", "/redefinir-senha", "/*/garcom", "/*/pedido/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
