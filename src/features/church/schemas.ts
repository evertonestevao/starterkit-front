import { z } from "zod";

/**
 * Schemas do domínio próprio, compartilhados entre client (feedback imediato)
 * e server (fonte de verdade — a action valida de novo).
 *
 * A validação FINA do hostname (formato, apex vs subdomínio, blocklist) mora em
 * `src/lib/domain` e roda no service: é regra de negócio, não de formulário.
 */

export const churchIdSchema = z.uuid("Igreja inválida");

export const customDomainSchema = z.object({
  churchId: churchIdSchema,
  domain: z
    .string()
    .trim()
    .min(4, "Informe o domínio da sua igreja")
    .max(253, "Domínio longo demais"),
});

export const churchDomainTargetSchema = z.object({
  churchId: churchIdSchema,
});

export type CustomDomainInput = z.infer<typeof customDomainSchema>;
