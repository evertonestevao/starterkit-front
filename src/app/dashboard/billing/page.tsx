import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import {
  CancelSubscriptionButton,
  SubscribeButton,
} from "@/features/billing/components/plan-actions";
import { AppError } from "@/lib/errors";
import { createSupabaseBillingRepository } from "@/repositories/supabase/billingRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { createBillingService } from "@/services/billingService";
import { permissionService } from "@/services/permissionService";
import type { Plan } from "@/types/database";

export const metadata: Metadata = { title: "Assinatura" };

/** Situação da assinatura em português (o provedor devolve em inglês). */
const STATUS_ASSINATURA: Record<string, string> = {
  trialing: "em período de teste",
  active: "ativa",
  past_due: "pagamento em atraso",
  canceled: "cancelada",
  unpaid: "não paga",
  incomplete: "aguardando pagamento",
  incomplete_expired: "expirada",
  paused: "pausada",
};

function formatPrice(plan: Plan): string {
  if (plan.price_cents === 0) return "Grátis";
  const value = (plan.price_cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: plan.currency,
  });
  return `${value}/${plan.billing_interval === "month" ? "mês" : "ano"}`;
}

const featureLabels: Record<string, string> = {
  max_members: "membros",
  api_access: "Acesso à API",
  reports: "Relatórios",
  audit_retention_days: "dias de auditoria",
};

function featureList(plan: Plan): string[] {
  return Object.entries(plan.features).map(([key, value]) => {
    const label = featureLabels[key] ?? key;
    if (typeof value === "boolean") return `${label}: ${value ? "sim" : "não"}`;
    return `${String(value)} ${label}`;
  });
}

export default async function BillingPage() {
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canManageBilling(active.role)) {
    redirect("/dashboard");
  }

  const client = await getSupabaseServerClient();
  const repo = createSupabaseBillingRepository(client);
  const billing = createBillingService(repo);

  const [currentPlan, subscription, plans, seats] = await Promise.all([
    billing.getEffectivePlan(active.id),
    repo.getActiveSubscription(active.id),
    listPlans(),
    billing.getSeatUsage(active.id),
  ]);

  async function listPlans(): Promise<Plan[]> {
    const { data, error } = await client
      .from("plans")
      .select("*")
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("price_cents", { ascending: true });
    if (error) throw new AppError("internal_error", "Falha ao listar planos", error);
    return (data ?? []) as Plan[];
  }

  const isFakeGateway = getServerEnv().PAYMENT_GATEWAY === "fake";
  const hasActiveSubscription =
    subscription != null && ["trialing", "active", "past_due"].includes(subscription.status);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Assinatura</h2>
        <p className="text-sm text-muted-foreground">
          Plano atual: <span className="font-medium text-foreground">{currentPlan?.name ?? "—"}</span>
          {subscription
            ? ` · ${STATUS_ASSINATURA[subscription.status] ?? subscription.status}`
            : " · sem assinatura (plano gratuito)"}
        </p>
      </div>

      {isFakeGateway ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Gateway <strong>fake</strong> ativo (dev): assinar um plano simula o webhook do provedor.
          Configure PAYMENT_GATEWAY=stripe e as chaves para usar checkout real.
        </p>
      ) : null}

      {/* Billing por seat: exceder o plano não bloqueia, cobra a mais. */}
      <Card>
        <CardHeader>
          <CardTitle>Seats</CardTitle>
          <CardDescription>
            Membros ativos e convites pendentes ocupam seat. Exceder o incluso no plano não
            bloqueia convites — os extras são cobrados por assento.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {seats.included === null ? (
            <p>
              <span className="font-medium text-foreground">{seats.used}</span> seats em uso ·
              plano sem limite de membros
            </p>
          ) : (
            <p>
              <span className="font-medium text-foreground">{seats.included}</span> inclusos no
              plano + <span className="font-medium text-foreground">{seats.extraSeats}</span>{" "}
              extras ={" "}
              <span className="font-medium text-foreground">
                {(seats.extraCostCents / 100).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: currentPlan?.currency ?? "BRL",
                })}
                /mês
              </span>{" "}
              em seats extras ({seats.used} em uso no total)
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = currentPlan?.id === plan.id;
          return (
            <Card key={plan.id} className={isCurrent ? "border-primary" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {isCurrent ? <Badge>Atual</Badge> : null}
                </CardTitle>
                <CardDescription className="text-lg font-semibold text-foreground">
                  {formatPrice(plan)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  {featureList(plan).map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="size-3.5 text-primary" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  {plan.code === "free" ? (
                    isCurrent ? (
                      <Badge variant="secondary">Plano padrão sem assinatura</Badge>
                    ) : null
                  ) : (
                    <SubscribeButton
                      planId={plan.id}
                      isFakeGateway={isFakeGateway}
                      isCurrent={isCurrent}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasActiveSubscription ? (
        <Card>
          <CardHeader>
            <CardTitle>Gerenciar assinatura</CardTitle>
            <CardDescription>
              O cancelamento mantém o acesso até o fim do período já pago.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CancelSubscriptionButton />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
