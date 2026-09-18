import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { RouteTabs } from "@/components/route-tabs";
import { brand } from "@/config/brand";
import { isPlatformStaff } from "@/server/platform";

const TABS = [{ href: "/plataforma/alteracoes", label: "Alterações" }];

/**
 * Área da moderação da plataforma.
 *
 * `notFound()` em vez de redirect para o login: quem não é da moderação não
 * precisa nem saber que esta área existe. A barreira real está no banco —
 * toda RPC daqui checa `is_platform_staff()` de novo.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPlatformStaff())) notFound();

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <Link
            href="/plataforma/alteracoes"
            className="flex min-w-0 items-center gap-2 font-semibold tracking-tight"
          >
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{brand.name}</span>
            <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
              · Moderação
            </span>
          </Link>
        </div>
        <div className="mx-auto w-full max-w-5xl px-4">
          <RouteTabs tabs={TABS} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:py-8">{children}</main>
    </div>
  );
}
