"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { useTenant } from "@/providers/tenant-provider";
import { Breadcrumbs } from "./breadcrumbs";
import { CompanySwitcher } from "./company-switcher";
import { titleForPath, visibleNavItems } from "./nav-items";
import { SectionSubnavProvider, subitemAtivo, useSectionSubnav } from "./section-subnav";
import { UserMenu, type UserMenuProps } from "./user-menu";

/** Cookie lido pelo layout server para SSR sem "flash" do estado colapsado. */
export const SIDEBAR_COOKIE = "sidebar-collapsed";

interface AppShellProps extends UserMenuProps {
  initialCollapsed: boolean;
  /** Convites pendentes PARA o usuário — badge de atenção em Configurações. */
  pendingInvitesCount?: number;
  /** Pedidos de oração chegados desde a última vez que ESTA pessoa abriu a tela. */
  unseenPrayerRequestsCount?: number;
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
  unseenPrayerRequestsCount = 0,
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
    <SectionSubnavProvider>
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
          unseenPrayerRequestsCount={unseenPrayerRequestsCount}
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
            unseenPrayerRequestsCount={unseenPrayerRequestsCount}
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
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
    </SectionSubnavProvider>
  );
}

/** Badge de atenção por item de menu: href -> quantidade + rótulo do que é. */
function badgesByHref(pendingInvitesCount: number, unseenPrayerRequestsCount: number) {
  return {
    "/dashboard/settings": { count: pendingInvitesCount, label: "convite(s) pendente(s)" },
    "/dashboard/prayers": { count: unseenPrayerRequestsCount, label: "pedido(s) de oração não visto(s)" },
  } as const;
}

function SidebarNav({
  collapsed,
  pathname,
  pendingInvitesCount = 0,
  unseenPrayerRequestsCount = 0,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  pendingInvitesCount?: number;
  unseenPrayerRequestsCount?: number;
  onNavigate?: () => void;
}) {
  const { menus } = useTenant();
  const visible = visibleNavItems(menus);
  const badges = badgesByHref(pendingInvitesCount, unseenPrayerRequestsCount);
  // Abas da seção aberta, publicadas pelo layout dela (ver section-subnav).
  const subnav = useSectionSubnav();
  const subAtivo = subnav ? subitemAtivo(subnav, pathname) : null;
  const contador = (count?: number) =>
    count && count > 0 ? (
      <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[0.7rem] leading-5 font-semibold text-white tabular-nums dark:text-neutral-950">
        {count > 99 ? "99+" : count}
        <span className="sr-only">{count === 1 ? " pendência" : " pendências"}</span>
      </span>
    ) : null;

  return (
    <nav className="flex flex-col gap-1 overflow-y-auto p-2">
      {visible.map((item) => {
        // Seção aberta: o item é dono das abas publicadas (mesmo prefixo).
        const subitens =
          subnav && item.href !== "/dashboard" && subnav.every((t) => t.href.startsWith(item.href)) ? subnav : null;
        const pendencias = subitens?.reduce((soma, t) => soma + (t.count ?? 0), 0) ?? 0;

        if (subitens && collapsed) {
          // Menu recolhido: os subitens abrem num painel ao lado do ícone.
          return (
            <DropdownMenu key={item.href}>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={item.title}
                    className="relative flex items-center justify-center rounded-md bg-sidebar-primary px-2 py-2 text-sm text-sidebar-primary-foreground"
                  />
                }
              >
                <item.icon className="size-4 shrink-0" />
                {pendencias > 0 ? (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive" />
                ) : null}
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="start" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{item.title}</DropdownMenuLabel>
                </DropdownMenuGroup>
                {subitens.map((t) => (
                  <DropdownMenuItem
                    key={t.href}
                    render={<Link href={t.href} aria-current={t.href === subAtivo ? "page" : undefined} />}
                    className={cn(t.href === subAtivo && "font-semibold")}
                  >
                    {t.label}
                    {contador(t.count)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }

        if (subitens) {
          return (
            <div key={item.href} className="flex flex-col gap-0.5">
              <Link
                href={item.href}
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <item.icon className="size-4 shrink-0" />
                <span>{item.title}</span>
                <ChevronDown className="ml-auto size-4 opacity-60" aria-hidden />
              </Link>
              <ul className="ml-5 flex flex-col gap-0.5 border-l pl-2">
                {subitens.map((t) => {
                  const atual = t.href === subAtivo;
                  return (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        onClick={onNavigate}
                        aria-current={atual ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                          atual
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        {t.label}
                        {contador(t.count)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        }

        const isActive = pathname === item.href;
        const badge = badges[item.href as keyof typeof badges];
        const badgeCount = badge?.count ?? 0;
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
                  aria-label={`${badgeCount} ${badge?.label}`}
                />
              ) : (
                <span
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-medium text-white"
                  aria-label={`${badgeCount} ${badge?.label}`}
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
