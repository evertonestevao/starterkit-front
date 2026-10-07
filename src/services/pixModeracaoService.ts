import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";

/**
 * Fila da moderação para a chave Pix das igrejas. A chave só vai para a
 * página pública depois de aprovada aqui (migration 20261006170000). Quem
 * decide é `platform_staff`; o banco confere de novo e registra a decisão em
 * `platform_staff_actions`.
 */

export interface PixPendente {
  churchId: string;
  churchName: string;
  publicCode: string;
  address: string | null;
  paginaAtiva: boolean;
  pixChave: string;
  pixTitular: string | null;
  enviadoEm: string | null;
  igrejaCriadaEm: string;
}

export interface PixModeracaoRepository {
  listPendentes(): Promise<PixPendente[]>;
  /** Lança not_found quando a chave já não está aguardando (decidida ou trocada). */
  decidir(input: { churchId: string; aprovar: boolean; motivo: string | null }): Promise<void>;
}

const decisaoSchema = z
  .object({
    churchId: z.uuid("Igreja inválida"),
    aprovar: z.boolean(),
    motivo: z
      .string()
      .trim()
      .max(300, "O motivo pode ter no máximo 300 caracteres")
      .transform((v) => v || null),
  })
  // Quem tem a chave recusada precisa saber o que corrigir.
  .refine((d) => d.aprovar || (d.motivo !== null && d.motivo.length >= 5), {
    path: ["motivo"],
    message: "Diga o motivo da recusa: a igreja vai ler isto",
  });

export function createPixModeracaoService(repo: PixModeracaoRepository) {
  return {
    listPendentes(): Promise<PixPendente[]> {
      return repo.listPendentes();
    },

    async decidir(input: unknown): Promise<{ aprovado: boolean }> {
      const parsed = decisaoSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const { churchId, aprovar, motivo } = parsed.data;
      await repo.decidir({ churchId, aprovar, motivo: aprovar ? null : motivo });
      return { aprovado: aprovar };
    },
  };
}

export type PixModeracaoService = ReturnType<typeof createPixModeracaoService>;

/** Erro do repositório quando a chave não está mais na fila. */
export function pixJaDecidido(cause?: unknown): AppError {
  return new AppError("not_found", "Esta chave não está mais aguardando: já foi decidida ou a igreja trocou.", cause);
}
