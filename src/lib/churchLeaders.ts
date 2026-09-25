import type { ChurchCargo, ChurchLeader } from "@/types/churchLeaders";

/**
 * Cargos da igreja, sem I/O. A lista é a mesma do catálogo `church_cargos`
 * (migration 20260927130000): o banco garante que só estes existem, e aqui
 * ficam o texto e a ordem de exibição.
 */

export const CHURCH_CARGOS: ReadonlyArray<{ slug: ChurchCargo; label: string; unico: boolean }> = [
  { slug: "pastor", label: "Pastor", unico: true },
  { slug: "pastor_auxiliar", label: "Pastor auxiliar", unico: false },
  { slug: "presbitero", label: "Presbítero", unico: false },
  { slug: "diacono", label: "Diácono", unico: false },
  { slug: "secretario", label: "Secretário", unico: false },
];

export const CARGO_LABEL = Object.fromEntries(CHURCH_CARGOS.map((c) => [c.slug, c.label])) as Record<
  ChurchCargo,
  string
>;

export function isChurchCargo(value: unknown): value is ChurchCargo {
  return CHURCH_CARGOS.some((cargo) => cargo.slug === value);
}

/** O cargo aceita uma pessoa só por igreja (hoje, o Pastor). */
export function isCargoUnico(cargo: ChurchCargo): boolean {
  return CHURCH_CARGOS.find((c) => c.slug === cargo)?.unico ?? false;
}

/** Pela ordem do catálogo (Pastor primeiro) e, dentro do cargo, por nome. */
export function sortLeaders<T extends Pick<ChurchLeader, "cargo" | "nome">>(leaders: readonly T[]): T[] {
  const posicao = (cargo: ChurchCargo) => CHURCH_CARGOS.findIndex((c) => c.slug === cargo);
  return [...leaders].sort(
    (a, b) => posicao(a.cargo) - posicao(b.cargo) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** "Pastor: João Silva" na lista de igrejas ligadas; null quando a igreja ainda não tem Pastor registrado. */
export function pastorLabel(nome: string | null | undefined): string | null {
  const limpo = nome?.trim();
  return limpo ? `Pastor: ${limpo}` : null;
}
