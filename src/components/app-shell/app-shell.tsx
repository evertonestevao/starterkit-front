"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { ChevronsLeft, ChevronsRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { useTenant } from "@/providers/tenant-provider";
import { Breadcrumbs } from "./breadcrumbs";
import { CompanySwitcher } from "./company-switcher";
import { navItems, titleForPath } from "./nav-items";
import { UserMenu, type UserMenuProps } from "./user-menu";

/** Cookie lido pelo layout server para SSR sem "flash" do estado colapsado. */
export const SIDEBAR_COOKIE = "sidebar-collapsed";

interface AppShellProps extends UserMenuProps {
  initialCollapsed: boolean;
  /** Convites pendentes PARA o usuário — badge de atenção em Configurações. */
  pendingInvitesCount?: number;
  children: React.ReactNode;
}

/**
 * Shell do app (plano §11): UMA sidebar que muda de comportamento —
 * desktop (lg+) fixa com modo rail persistido em cookie; abaixo de lg vira
 * drawer off-canvas (Sheet) aberto pelo hambúrguer. O conteúdo de navegação
 * (SidebarNav) é o mesmo nos dois contêineres.
 */
export function AppShell({
  initialCollapsed,
  pendingInvitesCount = 0,
  children,
  ...user
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      document.cookie = `${SIDEBAR_COOKIE}=${!current}; path=/; max-age=31536000; samesite=lax`;
      return !current;
    });
  }, []);

  return (
    <div className="flex min-h-svh w-full">
      {/* Sidebar desktop: some abaixo de lg; colapsa para rail de ícones. */}
      <aside
        data-collapsed={collapsed}
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-14" : "w-60",
        )}
      >
        <div className={cn("flex h-14 items-center border-b px-4", collapsed && "px-2 justify-center")}>
          <Link href="/dashboard" className="truncate font-semibold tracking-tight">
            {collapsed ? brand.name.slice(0, 1) : brand.name}
          </Link>
        </div>
        <SidebarNav
          collapsed={collapsed}
          pathname={pathname}
          pendingInvitesCount={pendingInvitesCount}
        />
        <div className="mt-auto border-t p-2">
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            onClick={toggleCollapsed}
            className={cn("w-full", !collapsed && "justify-start gap-2")}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            {collapsed ? null : <span>Recolher</span>}
          </Button>
        </div>
      </aside>

      {/* Sidebar mobile: mesmo SidebarNav dentro de um drawer off-canvas. */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 p-0 lg:hidden">
          <SheetHeader className="h-14 justify-center border-b px-4">
            <SheetTitle className="text-left font-semibold">{brand.name}</SheetTitle>
          </SheetHeader>
          <SidebarNav
            collapsed={false}
            pathname={pathname}
            pendingInvitesCount={pendingInvitesCount}
            onNavigate={() => setDrawerOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </Button>
          {/* Desktop: breadcrumbs; mobile: título da página atual. */}
          <div className="hidden min-w-0 lg:block">
            <Breadcrumbs pathname={pathname} />
          </div>
          <h1 className="truncate text-sm font-medium lg:hidden">{titleForPath(pathname)}</h1>
          <div className="ml-auto flex items-center gap-2">
            <CompanySwitcher />
            <UserMenu {...user} />
          </div>
        </header>
        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 p-4 outline-none lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarNav({
  collapsed,
  pathname,
  pendingInvitesCount = 0,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  pendingInvitesCount?: number;
  onNavigate?: () => void;
}) {
  const { active } = useTenant();
  const visible = navItems.filter((item) => item.roles.includes(active.role));

  return (
    <nav className="flex flex-col gap-1 p-2">
      {visible.map((item) => {
        const isActive = pathname === item.href;
        // Badge de atenção: convites pendentes para o usuário, em Configurações.
        const badgeCount = item.href === "/dashboard/settings" ? pendingInvitesCount : 0;
        const link = (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-2",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {collapsed ? <span className="sr-only">{item.title}</span> : <span>{item.title}</span>}
            {badgeCount > 0 ? (
              collapsed ? (
                <span
                  className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive"
                  aria-label={`${badgeCount} convite(s) pendente(s)`}
                />
              ) : (
                <span
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-white"
                  aria-label={`${badgeCount} convite(s) pendente(s)`}
                >
                  {badgeCount}
                </span>
              )
            ) : null}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={item.href}>
            <TooltipTrigger render={link} />
            <TooltipContent side="right">{item.title}</TooltipContent>
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}
