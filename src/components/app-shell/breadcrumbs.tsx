"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTenant } from "@/providers/tenant-provider";
import { titleForPath } from "./nav-items";

/** Breadcrumb simples: Dashboard / Página atual (desktop). */
export function Breadcrumbs({ pathname }: { pathname: string }) {
  const { menus } = useTenant();
  const current = titleForPath(pathname);
  const isRoot = pathname === "/dashboard";

  // Quem não tem o painel geral (ex.: só professor da EBD) vê só a página atual.
  if (!menus.includes("dashboard")) {
    return (
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        <li className="font-medium text-foreground">{current}</li>
      </ol>
    );
  }

  return (
    <ol className="flex items-center gap-1 text-sm text-muted-foreground">
      <li>
        {isRoot ? (
          <span className="font-medium text-foreground">Dashboard</span>
        ) : (
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
        )}
      </li>
      {!isRoot ? (
        <>
          <ChevronRight className="size-3.5" aria-hidden />
          <li className="font-medium text-foreground">{current}</li>
        </>
      ) : null}
    </ol>
  );
}
