import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Contact,
  CreditCard,
  HandCoins,
  HandHeart,
  HeartHandshake,
  Landmark,
  LayoutDashboard,
  ScrollText,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { MENUS, ROTA_MINHA_CONTA, type MenuDef } from "@/lib/menuPermissoes";

/**
 * Navegação da sidebar. O catálogo (título, rota, quem pode abrir) mora em
 * src/lib/menuPermissoes.ts — é lá que se adiciona um módulo; aqui só entra
 * o ícone dele.
 */

export interface NavItem extends MenuDef {
  icon: LucideIcon;
}

const ICONES: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  acompanhamento: ClipboardCheck,
  membros: Contact,
  ebd: BookOpen,
  prayers: HandHeart,
  programacao: CalendarClock,
  events: CalendarDays,
  campaigns: HandCoins,
  tesouraria: Wallet,
  sponsors: Landmark,
  relationships: HeartHandshake,
  billing: CreditCard,
  audit: ScrollText,
  settings: Settings,
};

export const navItems: NavItem[] = MENUS.map((menu) => ({ ...menu, icon: ICONES[menu.key] ?? LayoutDashboard }));

/**
 * Itens que a pessoa vê: as chaves vêm do servidor (papel + autorizações +
 * o que a igreja configurou em Configurações → Acessos).
 */
export function visibleNavItems(menus: string[]): NavItem[] {
  return navItems.filter((item) => menus.includes(item.key));
}

/** Título da página atual a partir do pathname (breadcrumb/header mobile). */
export function titleForPath(pathname: string): string {
  // Fora da sidebar: abre pelo menu do perfil.
  if (pathname === ROTA_MINHA_CONTA || pathname.startsWith(`${ROTA_MINHA_CONTA}/`)) return "Minha conta";
  const match = [...navItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
  return match?.title ?? "Painel";
}
