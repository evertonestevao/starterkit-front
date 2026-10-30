import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/** Fluxo link → contratação → pagamento → lançamento, com o gateway fake. */

const admin = createClient(
  process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321",
  // Demo key pública e fixa do Supabase CLI, a mesma de playwright.config.ts.
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  { auth: { persistSession: false } },
);

async function setModuleEnabled(enabled: boolean) {
  await admin.from("reseller_settings").update({ resellers_enabled: enabled }).eq("singleton", true);
}

async function setPlansAvailable(available: boolean) {
  await admin.from("plans").update({ available_to_resellers: available }).neq("code", "free");
}

async function createResellerWithRule() {
  const code = `e2e-com-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const { data: reseller } = await admin
    .from("resellers")
    .insert({ name: "Vendedor E2E", email: `${code}@e2e.local`, referral_code: code })
    .select("id, referral_code")
    .single();
  await admin
    .from("commission_rules")
    .insert({ reseller_id: reseller!.id, commission_type: "percent", commission_percent: 30 });
  return reseller!;
}

function paymentEvent(companyId: string, planId: string, paymentId: string) {
  return {
    type: "subscription.activated",
    gateway: "fake",
    externalSubscriptionId: `fake_${companyId}`,
    externalCustomerId: `fake_cus_${companyId}`,
    companyId,
    planId,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    payment: { externalId: paymentId, grossAmountCents: 10000 },
  };
}

async function sendWebhook(request: APIRequestContext, event: unknown) {
  const response = await request.post("/api/webhooks/fake", {
    data: event,
    headers: { "x-webhook-signature": "fake-signature" },
  });
  expect(response.status()).toBe(200);
}

async function commissionsOf(resellerId: string) {
  const { data } = await admin
    .from("reseller_commissions")
    .select("external_payment_id, amount_cents, base_amount_cents, months_covered, status, refund_flagged_at")
    .eq("reseller_id", resellerId)
    .order("created_at");
  return data!;
}

test.beforeEach(async () => {
  await setModuleEnabled(true);
  await setPlansAvailable(true);
});
test.afterAll(async () => {
  await setModuleEnabled(false);
  await setPlansAvailable(false);
});

test("link, contratação, pagamento e lançamento, com repetição, estorno e módulo desligado", async ({
  page,
  request,
}) => {
  const reseller = await createResellerWithRule();

  await page.goto(`/r/${reseller.referral_code}`);
  await signupAndOnboard(page, {
    email: uniqueEmail("comprador"),
    password: PASSWORD,
    name: "Comprador",
    company: "Empresa Compradora E2E",
  });

  await page.goto("/dashboard/billing");
  await page.getByRole("button", { name: "Ativar (dev)" }).first().click();
  await expect(page.getByText("status active")).toBeVisible();

  // Vínculo criado na contratação e o primeiro pagamento já gerou lançamento.
  const { data: client } = await admin
    .from("reseller_clients")
    .select("company_id, plan_id, sale_number")
    .eq("reseller_id", reseller.id)
    .single();
  expect(client!.sale_number).toBe(1);
  const first = await commissionsOf(reseller.id);
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ status: "pending", months_covered: 1 });
  expect(first[0].amount_cents).toBe(Math.round(first[0].base_amount_cents * 0.3));

  const { company_id: companyId, plan_id: planId } = client!;

  // Webhook repetido não duplica.
  await sendWebhook(request, paymentEvent(companyId, planId, "pay-e2e-a"));
  await sendWebhook(request, paymentEvent(companyId, planId, "pay-e2e-a"));
  expect(await commissionsOf(reseller.id)).toHaveLength(2);

  // Estorno de pendente reverte; de pago não muda e só sinaliza.
  await sendWebhook(request, {
    ...paymentEvent(companyId, planId, "pay-e2e-a"),
    type: "payment.refunded",
    payment: undefined,
    refund: { externalPaymentId: "pay-e2e-a", refundedCents: null },
  });
  await sendWebhook(request, paymentEvent(companyId, planId, "pay-e2e-b"));
  await admin
    .from("reseller_commissions")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("external_payment_id", "pay-e2e-b");
  await sendWebhook(request, {
    ...paymentEvent(companyId, planId, "pay-e2e-b"),
    type: "payment.refunded",
    payment: undefined,
    refund: { externalPaymentId: "pay-e2e-b", refundedCents: null },
  });
  const afterRefunds = await commissionsOf(reseller.id);
  expect(afterRefunds.find((c) => c.external_payment_id === "pay-e2e-a")?.status).toBe("reversed");
  const paid = afterRefunds.find((c) => c.external_payment_id === "pay-e2e-b");
  expect(paid?.status).toBe("paid");
  expect(paid?.amount_cents).toBe(3000);
  expect(paid?.refund_flagged_at).not.toBeNull();

  // Falha real de comissão (valor que a função SQL recusa): pagamento segue, com pendência.
  await sendWebhook(request, {
    ...paymentEvent(companyId, planId, "pay-e2e-falha"),
    payment: { externalId: `pay-e2e-falha-${companyId}`, grossAmountCents: 10.5 },
  });
  const { data: failure } = await admin
    .from("reseller_commission_failures")
    .select("status, gateway, payload")
    .eq("external_id", `pay-e2e-falha-${companyId}`)
    .single();
  expect(failure!.status).toBe("pending");
  expect(failure!.gateway).toBe("fake");
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .single();
  expect(subscription!.status).toBe("active");

  // Módulo desligado com vínculo existente: continua gerando.
  await setModuleEnabled(false);
  await sendWebhook(request, paymentEvent(companyId, planId, "pay-e2e-c"));
  expect((await commissionsOf(reseller.id)).some((c) => c.external_payment_id === "pay-e2e-c")).toBe(true);

  // Assinatura cancelada encerra o vínculo.
  await sendWebhook(request, {
    ...paymentEvent(companyId, planId, "x"),
    type: "subscription.canceled",
    payment: undefined,
  });
  const { data: ended } = await admin
    .from("reseller_clients")
    .select("ended_at")
    .eq("company_id", companyId)
    .single();
  expect(ended!.ended_at).not.toBeNull();
});

test("pagamento sem vínculo e plano não liberado não geram lançamento", async ({ page }) => {
  const reseller = await createResellerWithRule();
  await setPlansAvailable(false);

  await page.goto(`/r/${reseller.referral_code}`);
  await signupAndOnboard(page, {
    email: uniqueEmail("nao-liberado"),
    password: PASSWORD,
    name: "Comprador",
    company: "Empresa Plano Fechado E2E",
  });
  await page.goto("/dashboard/billing");
  await page.getByRole("button", { name: "Ativar (dev)" }).first().click();
  await expect(page.getByText("status active")).toBeVisible();

  const { data: clients } = await admin.from("reseller_clients").select("id").eq("reseller_id", reseller.id);
  expect(clients).toHaveLength(0);
  expect(await commissionsOf(reseller.id)).toHaveLength(0);
});

test("outro gateway na rota responde 404, e assinatura inválida é recusada", async ({ request }) => {
  const other = await request.post("/api/webhooks/asaas", { data: {} });
  expect(other.status()).toBe(404);
  const unsigned = await request.post("/api/webhooks/fake", { data: {} });
  expect(unsigned.status()).not.toBe(200);
});
