import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AvisoInstalarApp, RegistraServiceWorker } from "@/components/pwa/instalar-app";
import { METADADOS_DO_APP, VIEWPORT_DO_APP } from "@/config/appDoPainel";
import { brand } from "@/config/brand";

// Instalar o app já pela tela de login.
export const metadata: Metadata = METADADOS_DO_APP;
export const viewport: Viewport = VIEWPORT_DO_APP;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <div className="w-full max-w-sm">
        <RegistraServiceWorker />
        <AvisoInstalarApp />
        {children}
      </div>
    </div>
  );
}
