import { z } from "zod";
import { isValidDocumentFor, onlyDigits } from "@/lib/brDocument";
import { parseSponsorLink, type SponsorLink } from "@/lib/sponsorLink";

/**
 * Schemas do patrocinador, compartilhados entre client (feedback imediato) e
 * server (fonte de verdade — toda action valida de novo).
 */

export const sponsorKindSchema = z.enum(["person", "business"], {
  error: "Escolha pessoa ou empresa",
});

export const phoneSchema = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((digits) => digits === "" || (digits.length >= 10 && digits.length <= 11), {
    message: "Telefone com DDD, só números",
  })
  .transform((digits) => (digits === "" ? null : digits));

export const sponsorSignupSchema = z
  .object({
    kind: sponsorKindSchema,
    displayName: z.string().trim().min(2, "Informe o nome").max(120),
    document: z.string().trim().transform(onlyDigits),
    phone: phoneSchema,
  })
  .superRefine((value, ctx) => {
    if (!isValidDocumentFor(value.kind, value.document)) {
      ctx.addIssue({
        code: "custom",
        path: ["document"],
        message: value.kind === "person" ? "CPF inválido" : "CNPJ inválido",
      });
    }
  });

export const sponsorProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2, "Informe o nome").max(120),
  phone: phoneSchema,
});

/**
 * Pedido de alteração do que aparece na página pública da igreja. Os dois
 * campos são opcionais porque a pessoa pode mexer só no nome, só no logo, ou
 * em nada — quem decide se há mudança de verdade é o service, comparando com
 * o que já está valendo.
 */
/**
 * Campo único "link ou WhatsApp". Vazio vira `null` (remover o link); o
 * resultado já é o par (tipo, valor) normalizado, nunca o texto digitado.
 */
export const sponsorLinkSchema = z
  .string()
  .max(400, "Link muito longo")
  .transform((texto, ctx): SponsorLink | null => {
    const parsed = parseSponsorLink(texto);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.message });
      return z.NEVER;
    }
    return parsed.link;
  });

export const sponsorProfileChangeSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Informe o nome")
    .max(120)
    .optional(),
  logoPath: z.string().trim().min(1).max(400).optional(),
  /** Ausente = não mexeu; string vazia = remover; senão, site ou WhatsApp. */
  link: sponsorLinkSchema.optional(),
});

/**
 * Assinatura iniciada na página pública (sem login): junta os dados do
 * cadastro com o aceite dos termos, porque é ali que a pessoa entra no
 * serviço.
 */
export const publicSponsorshipSchema = sponsorSignupSchema.safeExtend({
  churchPublicCode: z.string().trim().min(1, "Igreja inválida").max(120),
  // Limpa ANTES de validar: espaço colado no fim do email (comum ao colar)
  // não pode reprovar o cadastro.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Email inválido")),
  acceptTerms: z.literal(true, { error: "É preciso aceitar os termos de uso" }),
  emailConsent: z.boolean().default(false),
});

export type PublicSponsorshipInput = z.infer<typeof publicSponsorshipSchema>;

/** Pedido de link de acesso (login sem senha). */
export const accessLinkSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
});

export const sponsorshipIdSchema = z.uuid("Patrocínio inválido");
export const churchIdSchema = z.uuid("Igreja inválida");

export type SponsorSignupInput = z.infer<typeof sponsorSignupSchema>;
export type SponsorProfileUpdateInput = z.infer<typeof sponsorProfileUpdateSchema>;
