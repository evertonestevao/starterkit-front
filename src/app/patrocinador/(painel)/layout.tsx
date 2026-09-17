import Link from "next/link";
import { redirect } from "next/navigation";
import { HandHeart, LogOut } from "lucide-react";
import { RouteTabs } from "@/components/route-tabs";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { sponsorSignOutAction } from "@/server/actions/sponsor";
import { getSponsorService } from "@/server/sponsor";

const TABS = [
  { href: "/patrocinador", label: "Início" },
  { href: "/patrocinador/metricas", label: "Métricas" },
  { href: "/patrocinador/patrocinios", label: "Patrocínios" },
  { href: "/patrocinador/pagamentos", label: "Pagamentos" },
];

/**
 * Painel do patrocinador. Separado do /dashboard das igrejas: patrocinador
 * não tem empresa, papel nem sidebar de gestão.
 */
export default async function SponsorPanelLayout({ children }: { children: React.ReactNode }) {
  const service = await getSponsorService();
  const account = await service.getMyAccount();
  if (!account) {
    redirect("/patrocinador/cadastro");
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <Link href="/patrocinador" className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
            <HandHeart className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{brand.name}</span>
            <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
              · Patrocinador
            </span>
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <span className="hidden truncate text-sm text-muted-foreground sm:inline">
              {account.display_name}
            </span>
            <form action={sponsorSignOutAction}>
              <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
                <LogOut className="size-4" aria-hidden />
                Sair
              </Button>
            </form>
          </div>
        </div>
        <div className="mx-auto w-full max-w-5xl px-4">
          <RouteTabs tabs={TABS} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:py-8">{children}</main>
    </div>
  );
}
