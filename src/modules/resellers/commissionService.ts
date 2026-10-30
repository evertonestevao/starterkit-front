import { AppError } from "@/lib/errors";
import type { NormalizedPaymentEvent } from "@/types/billing";

export interface CommissionFailure {
  id: string;
  status: "pending" | "resolved";
  payload: NormalizedPaymentEvent;
}

export interface CommissionRepository {
  findCompanyIdBySubscription(externalSubscriptionId: string): Promise<string | null>;
  getPlanInterval(planId: string): Promise<"month" | "year" | null>;
  registerCommission(input: {
    companyId: string;
    gateway: string;
    externalPaymentId: string;
    grossAmountCents: number;
    monthsCovered: number;
  }): Promise<void>;
  reverseCommission(gateway: string, externalPaymentId: string, refundedCents: number | null): Promise<void>;
  endClient(companyId: string): Promise<void>;
  recordFailure(input: {
    gateway: string;
    eventType: string;
    externalId: string;
    error: string;
    payload: NormalizedPaymentEvent;
  }): Promise<void>;
  resolveFailure(gateway: string, eventType: string, externalId: string): Promise<void>;
  getFailure(id: string): Promise<CommissionFailure | null>;
}

const MONTHS_BY_INTERVAL = { month: 1, year: 12 } as const;

/** Id que identifica o evento nas pendências, ou null se não diz respeito a comissão. */
function failureKey(event: NormalizedPaymentEvent): string | null {
  if (event.type === "subscription.activated") return event.payment?.externalId ?? null;
  if (event.type === "payment.refunded") return event.refund?.externalPaymentId ?? null;
  if (event.type === "subscription.canceled") return event.externalSubscriptionId;
  return null;
}

/**
 * Traduz eventos padrão do gateway em comissão (plano §7). Não conhece provedor nenhum.
 * Todas as operações são idempotentes no banco: repetir um evento não duplica nada.
 */
export function createCommissionService(repo: CommissionRepository) {
  async function resolveCompanyId(event: NormalizedPaymentEvent): Promise<string | null> {
    if (event.companyId) return event.companyId;
    return event.externalSubscriptionId
      ? repo.findCompanyIdBySubscription(event.externalSubscriptionId)
      : null;
  }

  async function apply(event: NormalizedPaymentEvent): Promise<void> {
    if (event.type === "subscription.activated" && event.payment) {
      const companyId = await resolveCompanyId(event);
      if (!companyId) return;
      const interval = event.planId ? await repo.getPlanInterval(event.planId) : null;
      if (!interval) {
        throw new AppError("internal_error", "Pagamento sem plano para calcular meses cobertos");
      }
      await repo.registerCommission({
        companyId,
        gateway: event.gateway,
        externalPaymentId: event.payment.externalId,
        grossAmountCents: event.payment.grossAmountCents,
        monthsCovered: MONTHS_BY_INTERVAL[interval],
      });
    } else if (event.type === "payment.refunded" && event.refund) {
      await repo.reverseCommission(event.gateway, event.refund.externalPaymentId, event.refund.refundedCents);
    } else if (event.type === "subscription.canceled") {
      const companyId = await resolveCompanyId(event);
      if (companyId) await repo.endClient(companyId);
    }
  }

  /**
   * Chamado depois de o pagamento ser aplicado. Falha vira pendência e não sobe: só
   * propaga se nem a pendência puder ser gravada, para o gateway reenviar o evento.
   */
  async function processEvent(event: NormalizedPaymentEvent): Promise<void> {
    const externalId = failureKey(event);
    if (!externalId) return;
    try {
      await apply(event);
      await repo.resolveFailure(event.gateway, event.type, externalId);
    } catch (err) {
      console.error(`[resellers] falha de comissão em ${event.type} ${externalId}:`, err);
      await repo.recordFailure({
        gateway: event.gateway,
        eventType: event.type,
        externalId,
        error: err instanceof Error ? err.message : "Erro desconhecido",
        payload: event,
      });
    }
  }

  /** Reprocesso manual de uma pendência. Devolve se ficou resolvida. */
  async function reprocessFailure(id: string): Promise<boolean> {
    const failure = await repo.getFailure(id);
    if (!failure) throw new AppError("not_found", "Pendência não encontrada");
    if (failure.status === "resolved") return true;
    await processEvent(failure.payload);
    const updated = await repo.getFailure(id);
    return updated?.status === "resolved";
  }

  return { processEvent, reprocessFailure };
}

export type CommissionService = ReturnType<typeof createCommissionService>;
