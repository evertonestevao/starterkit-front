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
  type LucideIcon,
} from "lucide-react";
import type { RoleCode } from "@/types/database";
import type { CompanyWithRole } from "@/types/tenant";

/** Autorizações extras de um member que também abrem um item do menu. */
type Autorizacao = "pode_acompanhar" | "pode_gerir_ebd" | "professor_ebd";

/**
 * Navegação da sidebar — editar aqui ao adicionar módulos do seu produto.
 *
 * Financeiro e Presença digital existem como rota (/dashboard/finance,
 * /presence) mas estão FORA do menu: as duas ainda são maquete, com números
 * fixos no arquivo. Um pastor que abre "Financeiro" e vê lançamentos que não
 * são da igreja dele perde a confiança no resto da tela que é real. Voltam
 * ao menu quando lerem o banco — é só devolver o item aqui.
 */

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Papéis que veem o item (autorização real fica no server/RLS). */
  roles: RoleCode[];
  /** Também aparece para quem tem uma destas autorizações (mesmo sendo member). */
  liberadoPara?: Autorizacao[];
}

/** Itens visíveis para a pessoa na empresa ativa. */
export function visibleNavItems(active: Pick<CompanyWithRole, "role" | Autorizacao>): NavItem[] {
  return navItems.filter(
    (item) => item.roles.includes(active.role) || (item.liberadoPara ?? []).some((a) => active[a]),
  );
}

export const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["owner", "admin", "member"],
  },
  {
    // Chamada nos cultos, justificativas e quem está faltando. Dado pessoal:
    // só a própria igreja; a RLS repete a regra (can_acompanhar).
    title: "Presença nos cultos",
    href: "/dashboard/acompanhamento",
    icon: ClipboardCheck,
    roles: ["owner", "admin"],
    liberadoPara: ["pode_acompanhar"],
  },
  {
    // As pessoas da igreja. Quem tem login aparece aqui com o papel; o acesso
    // é gerenciado na ficha do membro. Mesmo acesso da Chamada.
    title: "Membros",
    href: "/dashboard/membros",
    icon: Contact,
    roles: ["owner", "admin"],
    liberadoPara: ["pode_acompanhar"],
  },
  {
    // Escola Bíblica Dominical: classes, matrícula e chamada própria. O
    // professor vê só as classes dele (a RLS repete: can_ebd_classe).
    title: "EBD",
    href: "/dashboard/ebd",
    icon: BookOpen,
    roles: ["owner", "admin"],
    liberadoPara: ["pode_gerir_ebd", "professor_ebd"],
  },
  {
    // Dado sensível (LGPD): o texto do pedido é só de quem lidera a igreja.
    // A RLS também não devolve nada para member.
    title: "Pedidos de oração",
    href: "/dashboard/prayers",
    icon: HandHeart,
    roles: ["owner", "admin"],
  },
  {
    // O dia a dia (cultos semanais e especiais), sem inscrição.
    title: "Programação",
    href: "/dashboard/programacao",
    icon: CalendarClock,
    roles: ["owner", "admin", "member"],
  },
  {
    // Só o que tem inscrição e/ou pagamento.
    title: "Eventos",
    href: "/dashboard/events",
    icon: CalendarDays,
    roles: ["owner", "admin", "member"],
  },
  {
    title: "Campanhas",
    href: "/dashboard/campaigns",
    icon: HandCoins,
    roles: ["owner", "admin"],
  },
  {
    title: "Patrocinadores",
    href: "/dashboard/sponsors",
    icon: Landmark,
    roles: ["owner", "admin"],
  },
  {
    title: "Quem quer visita",
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
