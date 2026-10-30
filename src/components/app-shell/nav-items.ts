import {
  CreditCard,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { RoleCode } from "@/types/database";

/** Navegação da sidebar — editar aqui ao adicionar módulos do seu produto. */

/** Item de navegação de qualquer área do shell. */
export interface ShellNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
}

export interface NavItem extends ShellNavItem {
  /** Papéis que veem o item (autorização real fica no server/RLS). */
  roles: RoleCode[];
}

export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "member"],
  },
  { title: "Membros", href: "/dashboard/members", icon: Users, roles: ["owner", "admin"] },
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard, roles: ["owner"] },
  { title: "Auditoria", href: "/dashboard/audit", icon: ScrollText, roles: ["owner", "admin"] },
  {
    title: "Configurações",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ["owner", "admin", "member"],
  },
];

/** Título da página atual a partir do pathname (breadcrumb/header mobile). */
export function titleForPath(pathname: string, items: ShellNavItem[] = navItems): string {
  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.title ?? items[0]?.title ?? "Dashboard";
}
