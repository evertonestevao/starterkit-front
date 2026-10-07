import { z } from "zod";
import { isValidDocumentFor, onlyDigits } from "@/lib/brDocument";
import { AppError, toValidationError } from "@/lib/errors";
import { phoneSchema, sponsorKindSchema } from "@/features/sponsor/schemas";
import type { PaymentMethod, SponsorAccount, SponsorKind } from "@/types/sponsorship";

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
  /** Forma escolhida pela igreja (cartão, enquanto nada foi escolhido). */
  paymentMethod: PaymentMethod;
  /**
   * A mensalidade está contratada, mas não há cobrança recorrente no provedor:
   * o cadastro não foi concluído, ou a autorização do Pix foi cancelada por
   * mudança de valor. A igreja precisa escolher a forma e concluir.
   */
  needsAuthorization: boolean;
  /** O provedor de pagamento atual oferece Pix Automático. */
  pixDisponivel: boolean;
}

/** O QR Code do Pix Automático, para a tela mostrar. */
export interface PixParaAutorizar {
  payload: string;
  expiresAt: string | null;
}

export interface ResultadoDoPagamento {
  status: ChurchSelfPaymentStatus;
  /** Cartão: a página do provedor onde ele é informado. */
  invoiceUrl: string | null;
  /** Pix Automático: o QR Code para pagar o primeiro mês e autorizar os seguintes. */
  pix: PixParaAutorizar | null;
}

/** cobrável = a mensalidade da igreja está de fato correndo (ou prestes a). */
export function isSelfPaymentBillable(status: SelfPaymentSponsorshipStatus): boolean {
  return status === "pending_payment" || status === "active";
}

/** O que o repositório lê do banco; `pixDisponivel` vem do provedor, não dele. */
export type ChurchSelfPaymentStatusBase = Omit<ChurchSelfPaymentStatus, "pixDisponivel">;

export interface ChurchSelfPaymentRepository {
  getStatus(churchId: string): Promise<ChurchSelfPaymentStatusBase>;
  /** RPC definir_forma_mensalidade: grava a forma escolhida e devolve a conta de cobrança. */
  setPaymentMethod(churchId: string, method: PaymentMethod): Promise<string>;
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
  ): Promise<{ invoiceUrl: string | null; syncPending: boolean; pix?: PixParaAutorizar | null }>;
  /** Encerra o que estiver pendente no provedor e começa de novo (QR vencido, valor alterado). */
  restartSelfPayment(
    accountId: string,
    options: { successUrl?: string },
  ): Promise<{ invoiceUrl: string | null; syncPending: boolean; pix?: PixParaAutorizar | null }>;
}

const methodSchema = z.enum(["card", "pix_automatico"], "Escolha cartão ou Pix Automático");

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

export function createChurchSelfPaymentService(deps: {
  repo: ChurchSelfPaymentRepository;
  biller: SelfPaymentBiller;
  /** O provedor de pagamento atual sabe fazer Pix Automático. Sem isto, só cartão. */
  pixDisponivel?: boolean;
}) {
  const { repo, biller } = deps;
  const pixDisponivel = deps.pixDisponivel ?? false;

  async function status(churchId: string): Promise<ChurchSelfPaymentStatus> {
    return { ...(await repo.getStatus(churchId)), pixDisponivel };
  }

  /** A forma pedida, recusando o Pix quando o provedor não o oferece. */
  function formaValida(method: unknown): PaymentMethod {
    const parsed = methodSchema.safeParse(method ?? "card");
    if (!parsed.success) throw new AppError("validation_error", "Escolha cartão ou Pix Automático.");
    if (parsed.data === "pix_automatico" && !pixDisponivel) {
      throw new AppError("validation_error", "O Pix Automático ainda não está disponível. Use o cartão de crédito.");
    }
    return parsed.data;
  }

  return {
    getStatus(churchId: string): Promise<ChurchSelfPaymentStatus> {
      return status(churchId);
    },

    /**
     * Recomeça o pagamento de uma mensalidade que ficou sem concluir: o QR Code
     * do Pix venceu, a pessoa quer trocar de forma antes de pagar, ou a
     * autorização foi cancelada por mudança de valor. O banco confere quem
     * pede e recusa a troca de forma com uma cobrança recorrente viva.
     */
    async retomar(
      churchId: string,
      method: unknown,
      options: { successUrl?: string } = {},
    ): Promise<ResultadoDoPagamento> {
      const forma = formaValida(method);
      const atual = await repo.getStatus(churchId);
      if (!atual.account || !isSelfPaymentBillable(atual.sponsorshipStatus)) {
        throw new AppError("validation_error", "Cadastre primeiro quem paga a mensalidade.");
      }
      if (atual.sponsorshipStatus === "active" && !atual.needsAuthorization) {
        throw new AppError("validation_error", "A mensalidade já está sendo paga.");
      }
      // Trocar de forma com algo pendente: primeiro encerra o pendente, depois grava a forma.
      if (atual.paymentMethod !== forma && !atual.needsAuthorization) {
        throw new AppError(
          "validation_error",
          "Para trocar a forma de pagamento, conclua ou aguarde vencer a cobrança que está aberta.",
        );
      }
      const accountId = await repo.setPaymentMethod(churchId, forma);
      const { invoiceUrl, pix } = await biller.restartSelfPayment(accountId, options);
      return { status: await status(churchId), invoiceUrl, pix: pix ?? null };
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
      options: { successUrl?: string; method?: unknown } = {},
    ): Promise<ResultadoDoPagamento> {
      const forma = formaValida(options.method);
      const parsed = enableSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);

      const account = await repo.enable({ churchId, ...parsed.data });
      // Conta já com cobrança recorrente viva não troca de forma por aqui (o banco recusaria).
      if (!account.gateway_subscription_id) await repo.setPaymentMethod(churchId, forma);
      // A assinatura é no cartão: o provedor devolve a página onde o cartão é
      // digitado, e é para lá que a pessoa vai em seguida.
      const { invoiceUrl, pix } = await biller.syncBilling(account.id, {
        createIfMissing: true,
        ...(options.successUrl ? { successUrl: options.successUrl } : {}),
      });
      return { status: await status(churchId), invoiceUrl, pix: pix ?? null };
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
