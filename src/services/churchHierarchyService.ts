import { NOMES_PADRAO } from "@/lib/niveisRede";
import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
import type { ChurchTipo } from "@/types/database";

/**
 * Estrutura da árvore Sede > Subsede > Congregação, do lado da PLATAFORMA.
 *
 * Só a moderação liga uma igreja a outra: o vínculo decide quem enxerga os
 * dados de quem (a RLS desce pelo `path`). Uma igreja que pudesse escolher o
 * próprio pai se entregaria — ou entregaria a congregação dela — a uma sede
 * qualquer. As regras abaixo espelham os triggers de `churches`; o banco
 * barra de novo, aqui é para oferecer só opções válidas e responder com
 * mensagem clara.
 */

export const CHURCH_TIPOS = ["sede", "subsede", "congregacao"] as const satisfies readonly ChurchTipo[];

/**
 * Nomes PADRÃO dos níveis. O painel da plataforma atravessa as redes, então
 * não usa os nomes que cada rede escolheu (src/lib/niveisRede.ts).
 */
export const CHURCH_TIPO_LABEL: Record<ChurchTipo, string> = {
  sede: NOMES_PADRAO.sede.singular,
  subsede: NOMES_PADRAO.subsede.singular,
  congregacao: NOMES_PADRAO.congregacao.singular,
};

export interface HierarchyChurch {
  id: string;
  name: string;
  publicCode: string;
  tipo: ChurchTipo;
  parentId: string | null;
  /** ltree em texto: "sede.subsede.congregacao". */
  path: string;
  companyId: string | null;
  /** Declarado no cadastro; não é vínculo na árvore. */
  fazParteDeRede: boolean;
  /** Rede/ministério declarado (opcional). */
  redeNome: string | null;
}

export interface ChurchHierarchyRepository {
  listChurches(): Promise<HierarchyChurch[]>;
  setHierarchy(input: { churchId: string; tipo: ChurchTipo; parentId: string | null }): Promise<void>;
}

/** Quem pode ficar acima de quem. Congregação é folha; sede é raiz. */
export function tipoAceitaPai(tipo: ChurchTipo, tipoPai: ChurchTipo | null): boolean {
  switch (tipo) {
    case "sede":
      return tipoPai === null;
    case "subsede":
      return tipoPai === null || tipoPai === "sede";
    case "congregacao":
      return tipoPai === "sede" || tipoPai === "subsede";
  }
}

/** `b` está em `a` ou abaixo dele (mesma regra de `<@` do ltree). */
function isSameOrBelow(path: string, ancestorPath: string): boolean {
  return path === ancestorPath || path.startsWith(`${ancestorPath}.`);
}

/**
 * Igrejas que podem ficar acima de `church` com o tipo pedido: tipo
 * compatível e fora da própria subárvore (senão viraria ciclo).
 */
export function allowedParents(
  church: HierarchyChurch,
  tipo: ChurchTipo,
  all: HierarchyChurch[],
): HierarchyChurch[] {
  return all.filter(
    (candidate) =>
      candidate.id !== church.id &&
      !isSameOrBelow(candidate.path, church.path) &&
      tipoAceitaPai(tipo, candidate.tipo),
  );
}

export interface ChurchTreeNode extends HierarchyChurch {
  depth: number;
}

/** Lista em ordem de árvore (pai antes dos filhos), com a profundidade. */
export function toTreeOrder(churches: HierarchyChurch[]): ChurchTreeNode[] {
  return [...churches]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((church) => ({ ...church, depth: church.path.split(".").length - 1 }));
}

const setHierarchySchema = z.object({
  churchId: z.uuid("Igreja inválida"),
  tipo: z.enum(CHURCH_TIPOS, "Tipo inválido"),
  // "" do <select> = sem igreja acima.
  parentId: z
    .union([z.uuid("Igreja superior inválida"), z.literal("")])
    .transform((value) => (value === "" ? null : value)),
});

export function createChurchHierarchyService(repo: ChurchHierarchyRepository) {
  return {
    async listTree(): Promise<ChurchTreeNode[]> {
      return toTreeOrder(await repo.listChurches());
    },

    /**
     * Define tipo e igreja acima. Ligar uma subsede à sede depois é só isto:
     * o banco reescreve os paths da subárvore e a RLS passa a valer na hora.
     */
    async setHierarchy(input: unknown): Promise<void> {
      const parsed = setHierarchySchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const { churchId, tipo, parentId } = parsed.data;

      const all = await repo.listChurches();
      const church = all.find((c) => c.id === churchId);
      if (!church) throw new AppError("not_found", "Igreja não encontrada.");

      const parent = parentId ? all.find((c) => c.id === parentId) : null;
      if (parentId && !parent) throw new AppError("not_found", "Igreja superior não encontrada.");

      // Ciclo primeiro: é o erro que explica o que aconteceu, qualquer que
      // seja o tipo pedido.
      if (parent && isSameOrBelow(parent.path, church.path)) {
        throw new AppError("validation_error", "Uma igreja não pode ficar abaixo dela mesma.");
      }
      if (!tipoAceitaPai(tipo, parent?.tipo ?? null)) {
        throw new AppError(
          "validation_error",
          parent
            ? `${CHURCH_TIPO_LABEL[tipo]} não pode ficar abaixo de ${CHURCH_TIPO_LABEL[parent.tipo].toLowerCase()}.`
            : `${CHURCH_TIPO_LABEL[tipo]} precisa de uma igreja acima dela.`,
        );
      }

      // As filhas atuais continuam válidas com o tipo novo?
      const filhaInvalida = all.find((c) => c.parentId === church.id && !tipoAceitaPai(c.tipo, tipo));
      if (filhaInvalida) {
        throw new AppError(
          "validation_error",
          `${filhaInvalida.name} está abaixo desta igreja e não pode ficar abaixo de ${CHURCH_TIPO_LABEL[tipo].toLowerCase()}.`,
        );
      }

      await repo.setHierarchy({ churchId, tipo, parentId });
    },
  };
}

export type ChurchHierarchyService = ReturnType<typeof createChurchHierarchyService>;
