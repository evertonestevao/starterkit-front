import { AppError } from "@/lib/errors";
import type { PaymentGateway } from "@/adapters/payment/PaymentGateway";
import type { NormalizedPaymentEvent } from "@/types/billing";
import type { Plan, Subscription } from "@/types/database";

/**
 * Regras de negócio de billing. Sem I/O direto: o repositório é injetado,
 * o que mantém as regras testáveis (Vitest) e o Supabase trocável.
 */

export interface BillingRepository {
  getPlanById(planId: string): Promise<Plan | null>;
  getPlanByCode(code: string): Promise<Plan | null>;
  /** Assinatura não soft-deletada da empresa (única, por índice parcial). */
  getActiveSubscription(companyId: string): Promise<Subscription | null>;
  findSubscriptionByExternalId(externalId: string): Promise<Subscription | null>;
  insertSubscription(data: Partial<Subscription>): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<Subscription>): Promise<Subscription>;
  /** Membros ativos (deleted_at null) — cada um ocupa um seat. */
  countActiveMembers(companyId: string): Promise<number>;
  /** Convites pendentes também reservam seat (o convidado vai entrar). */
  countPendingInvites(companyId: string): Promise<number>;
}

/** Fotografia do uso de seats de uma empresa. */
export interface SeatUsage {
  /** Seats inclusos no plano (features.max_members); null = ilimitado. */
  included: number | null;
  /** Seats em uso: membros ativos + convites pendentes. */
  used: number;
  /** Seats além do incluso (0 quando ilimitado ou dentro do limite). */
  extraSeats: number;
  /** Custo mensal dos extras em centavos (extraSeats * plano). */
  extraCostCents: number;
}

/** Plano usado quando a empresa não tem assinatura ativa. */
export const DEFAULT_PLAN_CODE = "free";

/** Status de assinatura que dão acesso às features do plano. */
const ACCESS_STATUSES: ReadonlySet<Subscription["status"]> = new Set([
  "trialing",
  "active",
  "past_due", // carência: acesso mantido enquanto o gateway tenta cobrar
]);

export function createBillingService(repo: BillingRepository) {
  /** Plano efetivo da empresa: o da assinatura válida, senão o plano free. */
  async function getEffectivePlan(companyId: string): Promise<Plan | null> {
    const subscription = await repo.getActiveSubscription(companyId);
    if (subscription && ACCESS_STATUSES.has(subscription.status)) {
      const plan = await repo.getPlanById(subscription.plan_id);
      if (plan) return plan;
    }
    return repo.getPlanByCode(DEFAULT_PLAN_CODE);
  }

  /**
   * Ponto ÚNICO de checagem de feature/limite por plano (plano §9).
   * - valor booleano em plan.features: retorna ele
   * - valor numérico: true se > 0 (o limite em si vem de getFeatureLimit)
   * - ausente: false (feature não incluída no plano)
   */
  async function canAccessFeature(companyId: string, featureKey: string): Promise<boolean> {
    const plan = await getEffectivePlan(companyId);
    const value = plan?.features[featureKey];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value > 0;
    return false;
  }

  /** Limite numérico da feature no plano efetivo (null = sem limite definido). */
  async function getFeatureLimit(companyId: string, featureKey: string): Promise<number | null> {
    const plan = await getEffectivePlan(companyId);
    const value = plan?.features[featureKey];
    return typeof value === "number" ? value : null;
  }

  /**
   * Aplica um evento normalizado de webhook à tabela subscriptions.
   * Idempotente por externalSubscriptionId: evento repetido só re-grava o
   * mesmo estado. Chamado apenas no servidor (service_role), pois webhook
   * não tem sessão de usuário.
   */
  async function applyPaymentEvent(event: NormalizedPaymentEvent): Promise<void> {
    if (event.type === "ignored") return;
    if (!event.externalSubscriptionId) {
      throw new AppError("payment_error", "Evento de pagamento sem id de assinatura");
    }

    const existing = await repo.findSubscriptionByExternalId(event.externalSubscriptionId);

    if (!existing) {
      if (event.type !== "subscription.activated") return; // evento órfão: nada a atualizar
      if (!event.companyId || !event.planId) {
        throw new AppError("payment_error", "Evento de ativação sem company_id/plan_id");
      }
      // Reassinatura: a assinatura anterior (ex.: cancelada) ainda ocupa o índice
      // único por empresa. Vai para o histórico para a nova poder entrar.
      const previous = await repo.getActiveSubscription(event.companyId);
      if (previous) {
        await repo.updateSubscription(previous.id, { deleted_at: new Date().toISOString() });
      }
      await repo.insertSubscription({
        company_id: event.companyId,
        plan_id: event.planId,
        status: "active",
        external_subscription_id: event.externalSubscriptionId,
        external_customer_id: event.externalCustomerId,
        current_period_start: event.currentPeriodStart,
        current_period_end: event.currentPeriodEnd,
        cancel_at_period_end: event.cancelAtPeriodEnd,
      });
      return;
    }

    switch (event.type) {
      case "subscription.activated":
      case "subscription.updated":
        await repo.updateSubscription(existing.id, {
          status: "active",
          plan_id: event.planId ?? existing.plan_id,
          current_period_start: event.currentPeriodStart ?? existing.current_period_start,
          current_period_end: event.currentPeriodEnd ?? existing.current_period_end,
          cancel_at_period_end: event.cancelAtPeriodEnd,
        });
        break;
      case "subscription.canceled":
        await repo.updateSubscription(existing.id, { status: "canceled" });
        break;
      case "payment.failed":
        await repo.updateSubscription(existing.id, { status: "past_due" });
        break;
    }
  }

  /**
   * Uso de seats da empresa (billing por assento). Exceder o incluso NUNCA
   * bloqueia — vira cobrança extra. Limite ausente/não numérico = ilimitado.
   */
  async function getSeatUsage(companyId: string): Promise<SeatUsage> {
    const [plan, members, invites] = await Promise.all([
      getEffectivePlan(companyId),
      repo.countActiveMembers(companyId),
      repo.countPendingInvites(companyId),
    ]);
    const used = members + invites;
    const rawIncluded = plan?.features["max_members"];
    const included = typeof rawIncluded === "number" ? rawIncluded : null;
    const extraSeats = included === null ? 0 : Math.max(0, used - included);
    return {
      included,
      used,
      extraSeats,
      extraCostCents: extraSeats * (plan?.extra_seat_price_cents ?? 0),
    };
  }

  /**
   * Recalcula os seats extras e sincroniza a quantidade no gateway.
   * Sem assinatura ativa (plano free) não há o que cobrar — no-op.
   * Chamar após convite criado/revogado e membro removido.
   */
  async function syncSeatsWithGateway(
    companyId: string,
    gateway: PaymentGateway,
    extraSeatExternalPriceId: string | null,
  ): Promise<SeatUsage> {
    const usage = await getSeatUsage(companyId);
    const [subscription, plan] = await Promise.all([
      repo.getActiveSubscription(companyId),
      getEffectivePlan(companyId),
    ]);
    if (
      subscription &&
      ACCESS_STATUSES.has(subscription.status) &&
      subscription.external_subscription_id
    ) {
      await gateway.syncExtraSeats({
        externalSubscriptionId: subscription.external_subscription_id,
        quantity: usage.extraSeats,
        unitPriceCents: plan?.extra_seat_price_cents ?? 0,
        basePriceCents: plan?.price_cents ?? 0,
        externalPriceId: extraSeatExternalPriceId,
      });
    }
    return usage;
  }

  return {
    getEffectivePlan,
    canAccessFeature,
    getFeatureLimit,
    applyPaymentEvent,
    getSeatUsage,
    syncSeatsWithGateway,
  };
}

export type BillingService = ReturnType<typeof createBillingService>;
