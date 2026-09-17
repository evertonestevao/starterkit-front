import {
  CalendarDays,
  CreditCard,
  HandCoins,
  HandHeart,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MonitorSmartphone,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { RoleCode } from "@/types/database";

/** Navegação da sidebar — editar aqui ao adicionar módulos do seu produto. */

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
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
  {
    title: "Pessoas",
    href: "/dashboard/members",
    icon: Users,
    roles: ["owner", "admin"],
  },
  {
    title: "Pedidos de oração",
    href: "/dashboard/prayers",
    icon: HandHeart,
    roles: ["owner", "admin", "member"],
  },
  {
    title: "Eventos",
    href: "/dashboard/events",
    icon: CalendarDays,
    roles: ["owner", "admin", "member"],
  },
  {
    title: "Campanhas",
    href: "/dashboard/campaigns",
    icon: Megaphone,
    roles: ["owner", "admin", "member"],
  },
  {
    title: "Financeiro",
    href: "/dashboard/finance",
    icon: HandCoins,
    roles: ["owner", "admin"],
  },
  {
    title: "Presença digital",
    href: "/dashboard/presence",
    icon: MonitorSmartphone,
    roles: ["owner", "admin", "member"],
  },
  {
    title: "Patrocinadores",
    href: "/dashboard/sponsors",
    icon: Landmark,
    roles: ["owner", "admin"],
  },
  {
    title: "Relacionamentos",
    href: "/dashboard/relationships",
    icon: HeartHandshake,
    roles: ["owner", "admin", "member"],
  },
  {
    title: "Billing",
    href: "/dashboard/billing",
    icon: CreditCard,
    roles: ["owner"],
  },
  {
    title: "Auditoria",
    href: "/dashboard/audit",
    icon: ScrollText,
    roles: ["owner", "admin"],
  },
  {
    title: "Configurações",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ["owner", "admin", "member"],
  },
];

/** Título da página atual a partir do pathname (breadcrumb/header mobile). */
export function titleForPath(pathname: string): string {
  const match = [...navItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
  return match?.title ?? "Dashboard";
}
