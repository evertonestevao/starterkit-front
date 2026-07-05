"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPaymentGateway } from "@/adapters/payment";
import { getServerEnv } from "@/config/env";
import { AppError } from "@/lib/errors";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { getSupabaseAdminClient } from "@/server/supabase-admin";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getTenantService } from "@/server/tenant";
import { createBillingService } from "@/services/billingService";
import { permissionService } from "@/services/permissionService";
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
    const [{ data: userData }, billing] = await Promise.all([
      client.auth.getUser(),
      Promise.resolve(createBillingService(createSupabaseBillingRepository(client))),
    ]);
    if (!userData.user?.email) {
      throw new AppError("unauthorized", "Sessão expirada");
    }

    const appUrl = getServerEnv().APP_URL;
    const gateway = getPaymentGateway();
    const session = await gateway.createCheckout({
      companyId,
      planId,
      // Mapeie plano -> preço do gateway aqui quando plugar um provedor real
      // (ex.: env STRIPE_PRICE_PRO). O gateway fake ignora este campo.
      gatewayPriceId: `price_${planId}`,
      customerEmail: userData.user.email,
      successUrl: `${appUrl}/dashboard/billing?status=success`,
      cancelUrl: `${appUrl}/dashboard/billing?status=canceled`,
    });
    void billing; // reservado para persistir estado pré-checkout se necessário
    checkoutUrl = session.url;
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
    const billing = createBillingService(
      createSupabaseBillingRepository(getSupabaseAdminClient()),
    );
    await billing.applyPaymentEvent({
      type: "subscription.activated",
      gateway: "fake",
      externalSubscriptionId: `fake_${companyId}`,
      externalCustomerId: `fake_cus_${companyId}`,
      companyId,
      planId,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
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
    revalidatePath("/dashboard/billing");
    return { success: "Assinatura cancelada" };
  } catch (err) {
    return toActionError(err);
  }
}
