import Link from "next/link";
import { notFound } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { RouteTabs } from "@/components/route-tabs";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { signOutAction } from "@/server/actions/auth";
import { getPlatformModerationService, isPlatformStaff } from "@/server/platform";


/**
 * Área da moderação da plataforma.
 *
 * `notFound()` em vez de redirect para o login: quem não é da moderação não
 * precisa nem saber que esta área existe. A barreira real está no banco —
 * toda RPC daqui checa `is_platform_staff()` de novo.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  if (!(await isPlatformStaff())) notFound();

  // Contagem REAL, numa ida só ao banco. O badge soma o que tem ação a tomar
  // em cada aba: em Alterações, os pedidos e as contas travadas — as duas
  // coisas esperam um clique ali.
  const pendencias = await (await getPlatformModerationService()).getPendingCounts();
  const tabs = [
    { href: "/plataforma", label: "Visão geral" },
    {
      href: "/plataforma/alteracoes",
      label: "Alterações",
      count: pendencias.alteracoes + pendencias.contasTravadas,
    },
    { href: "/plataforma/denuncias", label: "Denúncias", count: pendencias.denuncias },
  ];

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <Link
            href="/plataforma"
            className="flex min-w-0 items-center gap-2 font-semibold tracking-tight"
          >
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{brand.name}</span>
            <span className="hidden text-sm font-normal text-muted-foreground sm:inline">
              · Moderação
            </span>
          </Link>
          <form action={signOutAction} className="ml-auto">
            <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
              <LogOut className="size-4" aria-hidden />
              Sair
            </Button>
          </form>
        </div>
        <div className="mx-auto w-full max-w-5xl px-4">
          <RouteTabs tabs={tabs} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:py-8">{children}</main>
    </div>
  );
}
