import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";
import { admin, makeSuperAdmin, resetModule } from "./reseller-helpers";

/** Painel do super admin: acesso e fluxo cadastrar vendedor, criar regra, liberar plano. */

test.afterAll(resetModule);

const ADMIN_PATHS = [
  "/admin/revendedores",
  "/admin/revendedores/regras",
  "/admin/revendedores/lancamentos",
  "/admin/revendedores/falhas",
];

test("sem sessão vai para o login; usuário comum não entra em nenhuma tela", async ({ page }) => {
  await page.goto(ADMIN_PATHS[0]);
  await expect(page).toHaveURL(/\/login/);

  await signupAndOnboard(page, {
    email: uniqueEmail("comum"),
    password: PASSWORD,
    name: "Usuário Comum",
    company: "Empresa Comum E2E",
  });
  for (const path of ADMIN_PATHS) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  await page.goto("/admin/revendedores/11111111-1111-4111-8111-111111111111");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("cadastrar vendedor, criar regra, liberar plano, ajustar cliente e pagar", async ({ page }) => {
  const adminEmail = uniqueEmail("super");
  await signupAndOnboard(page, {
    email: adminEmail,
    password: PASSWORD,
    name: "Super Admin",
    company: "Empresa Super E2E",
  });
  await makeSuperAdmin(adminEmail);

  await page.goto("/admin/revendedores");
  await expect(page.getByRole("heading", { name: "Vendedores" })).toBeVisible();

  // Liga o módulo (idempotente entre execuções).
  const toggle = page.getByRole("button", { name: "Ligar módulo" });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.getByRole("button", { name: "Desligar módulo" })).toBeVisible();
  }

  // Convite com código gerado.
  const sellerEmail = uniqueEmail("vendedor");
  const sellerName = `Vendedor ${Date.now()}`;
  await page.getByLabel("Nome", { exact: true }).fill(sellerName);
  await page.getByLabel("E-mail").fill(sellerEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText(`Convite enviado para ${sellerEmail}`)).toBeVisible();
  await expect(page.getByRole("link", { name: sellerName })).toBeVisible();

  const { data: reseller } = await admin
    .from("resellers")
    .select("id, user_id, referral_code, status")
    .eq("email", sellerEmail)
    .single();
  expect(reseller!.user_id).not.toBeNull();
  expect(reseller!.status).toBe("active");
  expect(reseller!.referral_code).toMatch(/^vendedor-\d+-[0-9a-f]{4}$/);

  // E-mail repetido é recusado.
  await page.getByLabel("Nome", { exact: true }).fill("Outro");
  await page.getByLabel("E-mail").fill(sellerEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText("Já existe vendedor")).toBeVisible();

  // Regra do vendedor, com o campo opcional de faixa.
  await page.goto("/admin/revendedores/regras");
  await page.getByLabel("Vendedor", { exact: true }).selectOption({ label: sellerName });
  await page.getByLabel("A partir da venda nº (opcional)").fill("1");
  await page.getByLabel("Valor", { exact: true }).fill("35");
  await page.getByRole("button", { name: "Criar regra" }).click();
  await expect(page.getByText("Regra criada")).toBeVisible();
  await expect(page.getByText(`${sellerName} · Todos os planos`)).toBeVisible();

  // Liberar plano.
  await admin.from("plans").update({ available_to_resellers: false }).neq("code", "free");
  await page.reload();
  await page.getByRole("button", { name: "Liberar Pro" }).click();
  await expect(page.getByRole("button", { name: "Esconder Pro" })).toBeVisible();
  const { data: plan } = await admin.from("plans").select("available_to_resellers").eq("code", "pro").single();
  expect(plan!.available_to_resellers).toBe(true);

  // Cliente vendido por ele, para ajustar e pagar. Empresa e vínculo vêm do banco.
  const { data: company } = await admin
    .from("company_members")
    .select("company_id")
    .limit(1)
    .single();
  const clientCompanyName = `Cliente Painel ${Date.now()}`;
  const { data: created } = await admin
    .from("companies")
    .insert({ name: clientCompanyName, slug: `cliente-painel-${Date.now()}` })
    .select("id")
    .single();
  expect(company).not.toBeNull();
  const { data: planPro } = await admin.from("plans").select("id").eq("code", "pro").single();
  await admin.rpc("link_company_to_reseller", {
    p_company_id: created!.id,
    p_reseller_id: reseller!.id,
    p_plan_id: planPro!.id,
    p_external_subscription_id: null,
  });
  await admin.rpc("register_commission", {
    p_company_id: created!.id,
    p_gateway: "fake",
    p_external_payment_id: `painel-${created!.id}`,
    p_base_amount_cents: 10000,
    p_months_covered: 1,
  });

  // Ajuste por cliente: marca override e aparece no histórico.
  await page.goto(`/admin/revendedores/${reseller!.id}`);
  await expect(page.getByText(clientCompanyName).first()).toBeVisible();
  await page.getByLabel("Valor", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Ajustar comissão" }).click();
  await expect(page.getByText("Vale para os próximos lançamentos")).toBeVisible();
  await expect(page.getByText("Ajuste manual", { exact: true })).toBeVisible();
  await expect(page.getByText("percentual: 35 → 40")).toBeVisible();

  // Lista com filtro e lote.
  await page.goto(`/admin/revendedores/lancamentos?reseller=${reseller!.id}`);
  await expect(page.getByText(clientCompanyName)).toBeVisible();
  await page.getByLabel("Data do pagamento").fill("2026-10-15");
  await page.getByRole("checkbox", { name: `Selecionar lançamento de ${clientCompanyName}` }).check();
  await page.getByRole("button", { name: "Marcar selecionados como pagos" }).click();
  await expect(page.getByText("1 lançamento marcado como pago")).toBeVisible();
  const { data: commission } = await admin
    .from("reseller_commissions")
    .select("status, paid_at, amount_cents")
    .eq("external_payment_id", `painel-${created!.id}`)
    .single();
  expect(commission!.status).toBe("paid");
  expect(commission!.paid_at).toContain("2026-10-15");
  expect(commission!.amount_cents).toBe(3500);

  // Filtro de status esconde o pago.
  await page.goto(`/admin/revendedores/lancamentos?reseller=${reseller!.id}&status=pending`);
  await expect(page.getByText("Nenhum lançamento com estes filtros")).toBeVisible();

  // Falha pendente reprocessada pela tela: o evento real, agora válido.
  await admin.rpc("record_commission_failure", {
    p_gateway: "fake",
    p_event_type: "subscription.activated",
    p_external_id: `falha-${created!.id}`,
    p_error: "erro de teste",
    p_payload: {
      type: "subscription.activated",
      gateway: "fake",
      companyId: created!.id,
      planId: planPro!.id,
      externalSubscriptionId: null,
      payment: { externalId: `falha-${created!.id}`, grossAmountCents: 10000 },
    },
  });
  await page.goto("/admin/revendedores/falhas");
  const row = page.locator("div.rounded-lg", { hasText: `falha-${created!.id}` });
  await row.getByRole("button", { name: "Reprocessar" }).click();
  // Resolvida, a linha some da lista junto com o botão.
  await expect(row).toHaveCount(0);
  const { data: reprocessed } = await admin
    .from("reseller_commissions")
    .select("id")
    .eq("external_payment_id", `falha-${created!.id}`);
  expect(reprocessed).toHaveLength(1);
});
