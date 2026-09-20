import { z } from "zod";
import { toValidationError } from "@/lib/errors";
import type { PlatformSettings } from "@/types/platform";

/**
 * Configurações da plataforma: vagas de primeiro patrocínio por tipo de
 * igreja e carência da marca na vitrine.
 *
 * Vaga VAZIA é ilimitado, e é diferente de zero (que fecha a igreja para
 * novos patrocinadores). Por isso o formulário manda string e a conversão
 * acontece aqui, num lugar só — `Number("")` é 0, e esse engano fecharia
 * todas as igrejas de uma vez.
 */

export interface PlatformSettingsRepository {
  get(): Promise<PlatformSettings>;
  update(input: {
    vagasSede: number | null;
    vagasSubsede: number | null;
    vagasCongregacao: number | null;
    carenciaMarcaDias: number;
  }): Promise<PlatformSettings>;
}

/** "" ou ausente = ilimitado (null). Senão, inteiro >= 0. */
const vagasSchema = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => (value === null || value === undefined ? "" : String(value).trim()))
  .refine((value) => value === "" || /^\d+$/.test(value), "Use um número inteiro de vagas, ou deixe vazio para ilimitado")
  .transform((value) => (value === "" ? null : Number(value)));

const carenciaSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+$/.test(value), "A carência é um número inteiro de dias, zero ou mais")
  .transform((value) => Number(value));

export const platformSettingsSchema = z.object({
  vagasSede: vagasSchema,
  vagasSubsede: vagasSchema,
  vagasCongregacao: vagasSchema,
  carenciaMarcaDias: carenciaSchema,
});

export function createPlatformSettingsService(repo: PlatformSettingsRepository) {
  return {
    get(): Promise<PlatformSettings> {
      return repo.get();
    },

    async update(input: unknown): Promise<PlatformSettings> {
      const parsed = platformSettingsSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      return repo.update(parsed.data);
    },
  };
}

export type PlatformSettingsService = ReturnType<typeof createPlatformSettingsService>;
