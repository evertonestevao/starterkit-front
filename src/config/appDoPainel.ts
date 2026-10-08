import type { Metadata, Viewport } from "next";
import { brand } from "@/config/brand";

/**
 * O painel como app instalável (PWA): manifesto, ícone do iPhone e cor da
 * barra. Vale no painel e nas telas de entrada (login, cadastro, senha), para
 * a pessoa poder instalar já pelo login. A página pública das igrejas tem o
 * app PRÓPRIO dela (src/lib/appDaIgreja.ts), com o nome e a logo da igreja.
 */
export const METADADOS_DO_APP: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const VIEWPORT_DO_APP: Viewport = {
  themeColor: "#41694b",
};
