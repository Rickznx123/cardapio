import { Suspense } from "react";
import type { Metadata } from "next";
import { MetaPixel } from "@/components/meta-pixel";
import { Geist, Geist_Mono } from "next/font/google";
import { PRODUTO, SITE_URL } from "@/lib/marca";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: PRODUTO,
  description: "Cardápio digital, delivery e pedidos sem taxa por pedido.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Suspense fallback={null}><MetaPixel /></Suspense>
      </body>
    </html>
  );
}
