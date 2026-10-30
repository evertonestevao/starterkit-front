"use client";

import {
  AlertTriangle,
  BadgePercent,
  Coins,
  Link2,
  Receipt,
  UserRound,
  Users,
} from "lucide-react";
import { AppShell, type AppShellProps } from "@/components/app-shell/app-shell";
import type { ShellNavItem } from "@/components/app-shell/nav-items";

const ADMIN_NAV: ShellNavItem[] = [
  { title: "Vendedores", href: "/admin/revendedores", icon: Users },
  { title: "Regras e planos", href: "/admin/revendedores/regras", icon: BadgePercent },
  { title: "Lançamentos", href: "/admin/revendedores/lancamentos", icon: Receipt },
  { title: "Alertas e falhas", href: "/admin/revendedores/falhas", icon: AlertTriangle },
];

const SELLER_NAV: ShellNavItem[] = [
  { title: "Meu link", href: "/vendedor", icon: Link2 },
  { title: "Meus clientes", href: "/vendedor/clientes", icon: Users },
  { title: "Minhas comissões", href: "/vendedor/comissoes", icon: Coins },
  { title: "Minha conta", href: "/vendedor/conta", icon: UserRound },
];

type AreaShellProps = Omit<AppShellProps, "area">;

// Ícones são funções: a lista precisa nascer no client, não vir do layout de servidor.
export function ResellerAdminShell(props: AreaShellProps) {
  return <AppShell {...props} area={{ home: ADMIN_NAV[0], items: ADMIN_NAV }} />;
}

export function SellerShell(props: AreaShellProps) {
  return <AppShell {...props} area={{ home: SELLER_NAV[0], items: SELLER_NAV }} />;
}
