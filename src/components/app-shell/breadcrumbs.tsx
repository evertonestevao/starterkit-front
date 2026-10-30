"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { navItems, titleForPath, type ShellNavItem } from "./nav-items";

/** Breadcrumb simples: Dashboard / Página atual (desktop). */
export function Breadcrumbs({
  pathname,
  items = navItems,
}: {
  pathname: string;
  items?: ShellNavItem[];
}) {
  const current = titleForPath(pathname, items);
  const home = items[0];
  const isRoot = pathname === home.href;

  return (
    <ol className="flex items-center gap-1 text-sm text-muted-foreground">
      <li>
        {isRoot ? (
          <span className="font-medium text-foreground">{home.title}</span>
        ) : (
          <Link href={home.href} className="hover:text-foreground">
            {home.title}
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
