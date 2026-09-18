import {
  publicEventSignupSchema,
  publicPrayerSchema,
  publicVisitorSchema,
} from "@/features/church/schemas";
import { toValidationError } from "@/lib/errors";

/**
 * O que um VISITANTE envia pela página pública da igreja: pedido de oração,
 * primeira visita e inscrição em evento.
 *
 * Separado do communityService de propósito: aquele é a caixa de entrada da
 * igreja (quem lê é o pastor, filtrado pela empresa dele); este é quem escreve
 * sem ter conta. Atores diferentes, regras diferentes.
 *
 * Validação aqui, não só no formulário: é a página mais aberta do sistema.
 */

export interface PublicSubmissionRepository {
  insertPrayerRequest(input: { churchId: string; name: string | null; message: string }): Promise<void>;
  insertVisitor(input: { churchId: string; name: string; contact: string }): Promise<void>;
  insertEventSignup(input: {
    churchId: string;
    eventName: string;
    personName: string;
    contact: string;
  }): Promise<void>;
}

export function createPublicSubmissionService(repo: PublicSubmissionRepository) {
  return {
    async submitPrayerRequest(input: unknown): Promise<void> {
      const parsed = publicPrayerSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await repo.insertPrayerRequest({
        churchId: parsed.data.churchId,
        name: parsed.data.name ?? null,
        message: parsed.data.message,
      });
    },

    async submitVisitor(input: unknown): Promise<void> {
      const parsed = publicVisitorSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await repo.insertVisitor(parsed.data);
    },

    async submitEventSignup(input: unknown): Promise<void> {
      const parsed = publicEventSignupSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await repo.insertEventSignup(parsed.data);
    },
  };
}

export type PublicSubmissionService = ReturnType<typeof createPublicSubmissionService>;
