import { Suspense } from "react";
import { AvisoDaUrl } from "@/components/aviso-da-url";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmarHost } from "@/components/confirmar";
import { brand } from "@/config/brand";
import { ThemeProvider } from "@/providers/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`,
  },
  description: brand.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="top-right" />
          {/* useSearchParams pede Suspense; o aviso não atrasa o resto da página. */}
          <Suspense fallback={null}>
            <AvisoDaUrl />
          </Suspense>
          <ConfirmarHost />
        </ThemeProvider>
      </body>
    </html>
  );
}
