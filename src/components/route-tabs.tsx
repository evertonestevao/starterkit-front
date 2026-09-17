"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Abas navegadas por ROTA (não por estado de client). Usadas em
 * Configurações e no painel do patrocinador.
 *
 * Cada aba é uma página server própria: continua renderizando no servidor,
 * fica deep-linkável e o `revalidatePath` das actions atinge só a aba que
 * mudou. Um componente de tabs client traria o oposto — tudo numa rota só,
 * sem link direto para a aba, e obrigaria a subir os dados de todas elas.
 */

export interface RouteTab {
  href: string;
  label: string;
}

export function RouteTabs({ tabs }: { tabs: RouteTab[] }) {
  const pathname = usePathname();

  return (
    // Rolagem horizontal no mobile: aba nova não quebra o layout nem some.
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
