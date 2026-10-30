"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPaymentGateway } from "@/adapters/payment";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { endCompanyResellerLink, getCommissionService, linkCompanyAtCheckout } from "@/modules/resellers/server";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { createSupabaseUserRepository } from "@/repositories/supabase/userRepository";
import { recordAudit } from "@/server/audit";
import { getExternalPriceId } from "@/server/billing";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getTenantService } from "@/server/tenant";
import { createBillingService } from "@/services/billingService";
import { permissionService } from "@/services/permissionService";
import { createUserService } from "@/services/userService";
import type { NormalizedPaymentEvent } from "@/types/billing";
import { toActionError, type ActionState } from "./action-state";

/** Server actions de billing — toda ação revalida que o ator é owner. */

async function requireOwner(companyId: string) {
  const tenant = await getTenantService();
  const role = await tenant.requireMembership(companyId);
  if (!permissionService.canManageBilling(role)) {
    throw new AppError("forbidden", "Só o owner gerencia o billing");
  }
}

export async function checkoutAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let checkoutUrl: string;
  try {
    const companyId = String(formData.get("companyId") ?? "");
    const planId = String(formData.get("planId") ?? "");
    await requireOwner(companyId);

    const client = await getSupabaseServerClient();
    const repo = createSupabaseBillingRepository(client);
    const [{ data: userData }, plan, profile] = await Promise.all([
      client.auth.getUser(),
      repo.getPlanById(planId),
      createUserService(createSupabaseUserRepository(client)).getMyProfile(),
    ]);
    if (!userData.user?.email) {
      throw new AppError("unauthorized", "Sessão expirada");
    }
    if (!plan) {
      throw new AppError("not_found", "Plano não encontrado");
    }

    // Antes de cobrar: o primeiro pagamento já precisa encontrar o vínculo.
    await linkCompanyAtCheckout(companyId, plan.id);

    const appUrl = getServerEnv().APP_URL;
    const gateway = getPaymentGateway();
    const session = await gateway.createCheckout({
      companyId,
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        priceCents: plan.price_cents,
        currency: plan.currency,
        billingInterval: plan.billing_interval,
        // Só gateways com catálogo usam (PAYMENT_PRICE_<CODE>) — ver src/server/billing.ts.
        externalPriceId: getExternalPriceId(plan.code),
      },
      customer: { email: userData.user.email, name: profile?.full_name ?? null },
      successUrl: `${appUrl}/dashboard/billing?status=success`,
      cancelUrl: `${appUrl}/dashboard/billing?status=canceled`,
    });
    checkoutUrl = session.url;
    await recordAudit({
      companyId,
      action: "subscription.checkout_started",
      entityType: "subscription",
      metadata: { plan_id: planId, gateway: gateway.name },
    });
  } catch (err) {
    return toActionError(err);
  }
  redirect(checkoutUrl);
}

/**
 * Dev-only: com o gateway fake ativo, simula o webhook de ativação para o
 * template funcionar de ponta a ponta sem provedor real. Com gateway real
 * configurado, esta action recusa — a ativação vem do webhook assinado.
 */
export async function activateFakePlanAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const companyId = String(formData.get("companyId") ?? "");
    const planId = String(formData.get("planId") ?? "");
    await requireOwner(companyId);

    if (getServerEnv().PAYMENT_GATEWAY !== "fake") {
      throw new AppError("forbidden", "Disponível apenas com o gateway fake (dev)");
    }

    // service_role: mesma via que o webhook real usaria (sem sessão de usuário).
    const repo = createSupabaseBillingRepository(getSupabaseAdminClient());
    const billing = createBillingService(repo);
    const plan = await repo.getPlanById(planId);
    if (!plan) {
      throw new AppError("not_found", "Plano não encontrado");
    }
    await linkCompanyAtCheckout(companyId, planId);
    const event: NormalizedPaymentEvent = {
      type: "subscription.activated",
      gateway: "fake",
      externalSubscriptionId: `fake_${companyId}`,
      externalCustomerId: `fake_cus_${companyId}`,
      companyId,
      planId,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      payment: { externalId: `fake_pay_${randomUUID()}`, grossAmountCents: plan.price_cents },
    };
    await billing.applyPaymentEvent(event);
    await getCommissionService().processEvent(event);
    await recordAudit({
      companyId,
      action: "subscription.activated",
      entityType: "subscription",
      metadata: { plan_id: planId, gateway: "fake" },
    });
    revalidatePath("/dashboard/billing");
    return { success: "Plano ativado (simulação de webhook do gateway fake)" };
  } catch (err) {
    return toActionError(err);
  }
}

export async function cancelSubscriptionAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const companyId = String(formData.get("companyId") ?? "");
    await requireOwner(companyId);

    const client = await getSupabaseServerClient();
    const repo = createSupabaseBillingRepository(client);
    const subscription = await repo.getActiveSubscription(companyId);
    if (!subscription) {
      throw new AppError("not_found", "Nenhuma assinatura ativa");
    }

    if (subscription.external_subscription_id) {
      await getPaymentGateway().cancelSubscription(subscription.external_subscription_id);
    }
    await repo.updateSubscription(subscription.id, {
      status: "canceled",
      cancel_at_period_end: true,
    });
    // O webhook também encerra; aqui cobre gateway sem webhook de cancelamento. Idempotente.
    await endCompanyResellerLink(companyId);
    await recordAudit({
      companyId,
      action: "subscription.canceled",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { plan_id: subscription.plan_id },
    });
    revalidatePath("/dashboard/billing");
    return { success: "Assinatura cancelada" };
  } catch (err) {
    return toActionError(err);
  }
}
