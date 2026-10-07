import type { Cargo, CargoResumo, OrigemCargo } from "@/types/cargos";

/**
 * Regras puras do catálogo de cargos (sem I/O).
 */

export const ORIGEM_LABEL: Record<OrigemCargo, string> = {
  plataforma: "Padrão",
  herdado: "Herdado",
  proprio: "Desta igreja",
};

/** Origem do cargo vista pela igreja ativa. */
export function origemDoCargo(cargoChurchId: string | null, igrejaAtiva: string): OrigemCargo {
  if (cargoChurchId === null) return "plataforma";
  return cargoChurchId === igrejaAtiva ? "proprio" : "herdado";
}

const PESO_ORIGEM: Record<OrigemCargo, number> = { plataforma: 0, herdado: 1, proprio: 2 };

/** Padrão primeiro, depois herdados, depois os próprios; dentro de cada, pela ordem e pelo nome. */
export function ordenarCargos<T extends Pick<Cargo, "origem" | "ordem" | "nome">>(cargos: readonly T[]): T[] {
  return [...cargos].sort(
    (a, b) =>
      PESO_ORIGEM[a.origem] - PESO_ORIGEM[b.origem] || a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Para listas de quem ocupa: pela ordem do cargo e pelo nome. */
export function ordenarResumos<T extends Pick<CargoResumo, "ordem" | "nome">>(cargos: readonly T[]): T[] {
  return [...cargos].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Só quem criou edita: a igreja dona. Padrão da plataforma e herdados, nunca. */
export function podeEditarCargo(cargo: Pick<Cargo, "origem">): boolean {
  return cargo.origem === "proprio";
}

/** "Pastor: João Silva" na lista de igrejas ligadas; null quando a igreja ainda não tem Pastor. */
export function pastorLabel(nome: string | null | undefined): string | null {
  const limpo = nome?.trim();
  return limpo ? `Pastor: ${limpo}` : null;
}

/** Cargos que podem ser dados a alguém agora (desativado só aparece no histórico). */
export function cargosAtribuiveis<T extends Pick<Cargo, "desativado">>(cargos: readonly T[]): T[] {
  return cargos.filter((c) => !c.desativado);
}
