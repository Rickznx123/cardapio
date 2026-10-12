// Manifest por empresa: o app instalado abre direto no /{slug}/garcom.
export async function GET(_: Request, { params }: RouteContext<"/[slug]/garcom/manifest">) {
  const { slug } = await params;
  return Response.json(
    {
      name: `Garçom · ${slug}`,
      short_name: "Garçom",
      start_url: `/${slug}/garcom`,
      scope: `/${slug}/garcom`,
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#E11D48",
      icons: [
        { src: "/icons/garcom-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icons/garcom-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
