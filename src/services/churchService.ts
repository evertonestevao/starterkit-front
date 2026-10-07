import type { Church, Template } from "@/types/database";

export type ChurchTemplateNode = Pick<
  Church,
  "id" | "parent_id" | "template_mode" | "template_id"
>;

export const TEMPLATE_OPTIONS = [
  {
    slug: "classico",
    name: "Clássico",
    description: "Visual clássico com tons navais e destaques em vinho.",
  },
  {
    slug: "clean",
    name: "Clean",
    description: "Minimalista, claro e sem distrações.",
  },
  {
    slug: "dark",
    name: "Dark",
    description: "Tema grafite com contraste elegante e moderno.",
  },
  {
    slug: "meia-noite",
    name: "Meia-noite",
    description: "Azul profundo com destaque em azul-céu.",
  },
  {
    slug: "lavanda",
    name: "Lavanda",
    description: "Claro e suave, com lilás e roxo.",
  },
  {
    slug: "terra",
    name: "Terra",
    description: "Tons de areia e marrom com destaque terracota.",
  },
] as const;

export function pickTemplateIdForChurch(
  church: ChurchTemplateNode,
  allChurches: ChurchTemplateNode[],
): string | null {
  const visited = new Set<string>();
  let current: ChurchTemplateNode | null = church;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);

    if (current.template_mode === "custom" && current.template_id) {
      return current.template_id;
    }

    current = current.parent_id
      ? (allChurches.find((entry) => entry.id === current?.parent_id) ?? null)
      : null;
  }

  return null;
}

export function resolveTemplateSlug(
  template: Pick<Template, "slug"> | null | undefined,
): string {
  return template?.slug ?? "dark";
}
