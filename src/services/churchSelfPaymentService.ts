import { z } from "zod";
import { isValidDocumentFor, onlyDigits } from "@/lib/brDocument";
import { AppError, toValidationError } from "@/lib/errors";
import { phoneSchema, sponsorKindSchema } from "@/features/sponsor/schemas";
import type { SponsorAccount, SponsorKind } from "@/types/sponsorship";

/**
 * Autopatrocínio: uma igreja sem nenhum patrocinador pode assumir a própria
 * mensalidade. Reaproveita sponsor_accounts/sponsorships por inteiro (ver a
 * migration) — este service só cuida da parte que é específica da IGREJA:
 * decidir se ela pode optar, e orquestrar a criação com quem já sabe cobrar
 * (`SponsorService.syncBilling`, injetado por quem monta este service).
 *
 * A regra "sem patrocinador ativo" é conferida no banco (as duas RPCs), não
 * aqui — este service confia na RPC para a checagem de verdade e só evita
 * uma chamada óbvia que ia falhar mesmo.
 */

export type SelfPaymentSponsorshipStatus = "pending_payment" | "active" | "cancel_scheduled" | "canceled" | null;

export interface ChurchSelfPaymentStatus {
  /** Quantos patrocínios DE VERDADE (não autopatrocínio) a igreja tem hoje. */
  realSponsorCount: number;
  /** A conta de autopatrocínio desta igreja, se já existiu algum dia. */
  account: SponsorAccount | null;
  /** Null = nunca existiu. `cancel_scheduled` = um patrocinador de verdade assumiu, cobre até `endsAt`. */
  sponsorshipStatus: SelfPaymentSponsorshipStatus;
  endsAt: string | null;
  aceitaPatrocinio: boolean;
  amountCents: number;
  /** Página de pagamento (cartão) da fatura em aberto, no provedor; null se não há. */
  openInvoiceUrl: string | null;
}

/** cobrável = a mensalidade da igreja está de fato correndo (ou prestes a). */
export function isSelfPaymentBillable(status: SelfPaymentSponsorshipStatus): boolean {
  return status === "pending_payment" || status === "active";
}

export interface ChurchSelfPaymentRepository {
  getStatus(churchId: string): Promise<ChurchSelfPaymentStatus>;
  /** RPC enable_church_self_payment: cria ou reaproveita a conta+patrocínio. */
  enable(input: {
    churchId: string;
    kind: SponsorKind;
    displayName: string;
    email: string;
    phone: string | null;
    document: string;
  }): Promise<SponsorAccount>;
  /** RPC set_church_aceita_patrocinio. */
  setAceitaPatrocinio(churchId: string, aceita: boolean): Promise<void>;
}

/** O que faz a cobrança acontecer de verdade — é o `SponsorService` já montado. */
export interface SelfPaymentBiller {
  syncBilling(
    accountId: string,
    options: { createIfMissing: boolean; successUrl?: string },
  ): Promise<{ invoiceUrl: string | null; syncPending: boolean }>;
}

export interface Actor {
  companyId: string;
}

const enableSchema = z
  .object({
    kind: sponsorKindSchema,
    displayName: z.string().trim().min(2, "Nome muito curto").max(120),
    email: z.email("Email inválido"),
    phone: phoneSchema,
    document: z.string().trim().transform(onlyDigits),
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

export function createChurchSelfPaymentService(deps: { repo: ChurchSelfPaymentRepository; biller: SelfPaymentBiller }) {
  const { repo, biller } = deps;

  return {
    getStatus(churchId: string): Promise<ChurchSelfPaymentStatus> {
      return repo.getStatus(churchId);
    },

    /**
     * Liga a mensalidade: grava a conta (o banco recusa se já tem
     * patrocinador) e cria a cobrança recorrente no cartão, no valor da igreja. Se a
     * cobrança falhar, a conta fica criada com sync pendente — igual ao
     * patrocínio normal, o job reenvia depois; não desfaz o que já foi
     * gravado, porque a igreja já está sem patrocinador de qualquer jeito.
     */
    async enable(
      churchId: string,
      input: unknown,
      options: { successUrl?: string } = {},
    ): Promise<{ status: ChurchSelfPaymentStatus; invoiceUrl: string | null }> {
      const parsed = enableSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);

      const account = await repo.enable({ churchId, ...parsed.data });
      // A assinatura é no cartão: o provedor devolve a página onde o cartão é
      // digitado, e é para lá que a pessoa vai em seguida.
      const { invoiceUrl } = await biller.syncBilling(account.id, {
        createIfMissing: true,
        ...(options.successUrl ? { successUrl: options.successUrl } : {}),
      });
      return { status: await repo.getStatus(churchId), invoiceUrl };
    },

    async setAceitaPatrocinio(churchId: string, aceita: unknown): Promise<void> {
      if (typeof aceita !== "boolean") {
        throw new AppError("validation_error", "Valor inválido.");
      }
      await repo.setAceitaPatrocinio(churchId, aceita);
    },
  };
}

export type ChurchSelfPaymentService = ReturnType<typeof createChurchSelfPaymentService>;
