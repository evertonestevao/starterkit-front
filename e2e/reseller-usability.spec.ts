import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";
import { admin, makeSuperAdmin, resetModule, setModuleEnabled, setPlansAvailable, userIdByEmail } from "./reseller-helpers";

/** Comportamentos de usabilidade do módulo. */

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 1e5)}`;

async function sellerWithPendingCommissions(amounts: number[]) {
  const code = `usa-${stamp()}`;
  const { data: seller } = await admin
    .from("resellers")
    .insert({ name: `Usa ${code}`, email: `${code}@e2e.local`, referral_code: code })
    .select("id, name")
    .single();
  await admin.from("commission_rules").insert({ reseller_id: seller!.id, commission_type: "percent", commission_percent: 10 });
  const { data: plan } = await admin.from("plans").select("id").eq("code", "pro").single();
  const names: string[] = [];
  for (const amount of amounts) {
    const name = `Cliente ${stamp()}`;
    names.push(name);
    const { data: company } = await admin.from("companies").insert({ name, slug: `usa-${stamp()}` }).select("id").single();
    await admin.rpc("link_company_to_reseller", {
      p_company_id: company!.id,
      p_reseller_id: seller!.id,
      p_plan_id: plan!.id,
      p_external_subscription_id: null,
    });
    await admin.rpc("register_commission", {
      p_company_id: company!.id,
      p_gateway: "fake",
      p_external_payment_id: `usa-${company!.id}`,
      p_base_amount_cents: amount,
      p_months_covered: 1,
    });
  }
  return { seller: seller!, names };
}

test.beforeEach(async ({ page }) => {
  await setModuleEnabled(true);
  await setPlansAvailable(true);
  const email = uniqueEmail("usa");
  await signupAndOnboard(page, { email, password: PASSWORD, name: "Super Usa", company: "Empresa Usa E2E" });
  await makeSuperAdmin(email);
});
test.afterAll(resetModule);

test("lançamentos: selecionar todos mostra o total, e os filtros têm Limpar", async ({ page }) => {
  const { seller, names } = await sellerWithPendingCommissions([10000, 20000]);
  await page.goto(`/admin/revendedores/lancamentos?reseller=${seller.id}`);

  await expect(page.getByText("Pendente nesta lista")).toBeVisible();
  await expect(page.getByText("R$ 30,00").first()).toBeVisible();
  await expect(page.getByText("10% sobre R$ 100,00")).toBeVisible();

  const submit = page.getByRole("button", { name: "Marcar selecionados como pagos" });
  await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: /Selecionar todos os pendentes/ }).check();
  await expect(page.getByText("2 selecionado(s): R$ 30,00")).toBeVisible();

  await page.getByRole("checkbox", { name: `Selecionar lançamento de ${names[0]}` }).uncheck();
  await expect(page.getByText("1 selecionado(s): R$ 20,00")).toBeVisible();

  await submit.click();
  await expect(page.getByText("1 lançamento marcado como pago")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Selecionar lançamento de ${names[1]}` })).toHaveCount(0);
  await expect(page.getByText("Nenhum selecionado")).toBeVisible();

  // Corrigir um valor fica recolhido até pedir.
  const input = page.getByLabel(`Valor da comissão de ${names[0]}`);
  await expect(input).toBeHidden();
  await page.locator("li", { hasText: names[0] }).getByText("Corrigir valor").click();
  await input.fill("15,50");
  await page.locator("li", { hasText: names[0] }).getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Lançamento alterado")).toBeVisible();
  await expect(page.locator("li", { hasText: names[0] }).getByText("R$ 15,50")).toBeVisible();

  await page.getByRole("link", { name: "Limpar" }).click();
  await expect(page).toHaveURL(/\/lancamentos$/);
  await expect(page.getByRole("link", { name: "Limpar" })).toHaveCount(0);
});

test("erro mantém o que foi digitado; sucesso limpa o cadastro", async ({ page }) => {
  await page.goto("/admin/revendedores");
  await page.getByLabel("Nome", { exact: true }).fill("Nome Digitado");
  await page.getByLabel("E-mail").fill("valido@e2e.local");
  await page.getByLabel("Código de indicação").fill("codigo com espaço");
  await page.getByRole("button", { name: "Enviar convite" }).click();

  await expect(page.getByText("Código: use letras, números e hífen")).toBeVisible();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("Nome Digitado");
  await expect(page.getByLabel("Código de indicação")).toHaveValue("codigo com espaço");

  const email = uniqueEmail("cadastro");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Código de indicação").fill(`codigo-${Date.now()}`);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText(`Convite enviado para ${email}`)).toBeVisible();
  await expect(page.getByLabel("Nome", { exact: true })).toHaveValue("");
});

test("ações destrutivas pedem confirmação, e cancelar não muda nada", async ({ page }) => {
  const { seller } = await sellerWithPendingCommissions([10000]);
  await page.goto(`/admin/revendedores/${seller.id}`);
  await expect(page.getByRole("list").getByText("Vendedores")).toHaveCount(1);
  await expect(page.getByText("Detalhes", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Suspender vendedor" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  const { data: still } = await admin.from("resellers").select("status").eq("id", seller.id).single();
  expect(still!.status).toBe("active");

  await page.getByRole("button", { name: "Suspender vendedor" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Suspender" }).click();
  await expect(page.getByRole("button", { name: "Reativar vendedor" })).toBeVisible();

  // Reativar não é destrutivo: vai direto.
  await page.getByRole("button", { name: "Reativar vendedor" }).click();
  await expect(page.getByRole("button", { name: "Suspender vendedor" })).toBeVisible();
});

test("plano grátis não aparece para liberar; falha usa texto claro; rótulo acompanha o tipo", async ({ page }) => {
  await page.goto("/admin/revendedores/regras");
  await expect(page.getByRole("button", { name: "Liberar Free" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Esconder Pro" })).toBeVisible();

  await expect(page.getByLabel("Valor (%)")).toBeVisible();
  await page.getByLabel("Tipo").selectOption("fixed");
  await expect(page.getByLabel("Valor (R$ por mês)")).toBeVisible();

  const external = `pay-${stamp()}`;
  await admin.rpc("record_commission_failure", {
    p_gateway: "fake",
    p_event_type: "subscription.activated",
    p_external_id: external,
    p_error: "erro de teste",
    p_payload: { type: "ignored", gateway: "fake" },
  });
  await page.goto("/admin/revendedores/falhas");
  const row = page.locator("div.rounded-lg", { hasText: external });
  await expect(row.getByText("Pagamento confirmado")).toBeVisible();
  await expect(row.getByText("subscription.activated")).toHaveCount(0);
});

test("vendedor suspenso vê a explicação; vendedor vê totais", async ({ page, browser }) => {
  const email = uniqueEmail("susp");
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const userId = created.data.user!.id;
  const { data: terms } = await admin.from("terms_versions").select("id").eq("is_current", true).single();
  await admin.from("terms_acceptances").insert({ user_id: userId, terms_version_id: terms!.id });
  const { seller } = await sellerWithPendingCommissions([10000]);
  await admin.from("resellers").update({ user_id: userId, email }).eq("id", seller.id);
  expect(await userIdByEmail(email)).toBe(userId);

  const context = await browser.newContext({ baseURL: page.url().split("/dashboard")[0] });
  const sellerPage = await context.newPage();
  await sellerPage.goto("/login");
  await sellerPage.getByLabel("Email").fill(email);
  await sellerPage.getByLabel("Senha").fill(PASSWORD);
  await sellerPage.getByRole("button", { name: "Entrar" }).click();
  await expect(sellerPage).toHaveURL(/\/vendedor$/);

  await sellerPage.goto("/vendedor/comissoes");
  await expect(sellerPage.getByText("A receber")).toBeVisible();
  await expect(sellerPage.getByText("R$ 10,00").first()).toBeVisible();
  await sellerPage.goto("/vendedor/clientes");
  await expect(sellerPage.getByText("Clientes ativos")).toBeVisible();

  await admin.from("resellers").update({ status: "suspended" }).eq("id", seller.id);
  await sellerPage.goto("/vendedor");
  await expect(sellerPage).toHaveURL(/\/acesso-suspenso$/);
  await expect(sellerPage.getByText("Seu acesso de vendedor está suspenso")).toBeVisible();

  // Sem empresa, entrar de novo também explica, em vez de levar ao onboarding.
  await sellerPage.goto("/dashboard");
  await expect(sellerPage).toHaveURL(/\/acesso-suspenso$/);
  await sellerPage.getByRole("button", { name: "Sair" }).click();
  await expect(sellerPage).toHaveURL(/\/login/);
  await context.close();
});

test("no celular, nenhuma tela do painel tem rolagem horizontal", async ({ page }) => {
  const { seller } = await sellerWithPendingCommissions([10000, 20000]);
  await page.setViewportSize({ width: 390, height: 800 });
  for (const path of [
    "/admin/revendedores",
    `/admin/revendedores/${seller.id}`,
    "/admin/revendedores/regras",
    `/admin/revendedores/lancamentos?reseller=${seller.id}`,
    "/admin/revendedores/falhas",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("comissão fixa aparece como valor por pagamento, sem base", async ({ page }) => {
  const { seller } = await sellerWithPendingCommissions([]);
  await admin
    .from("commission_rules")
    .update({ commission_type: "fixed", commission_percent: null, commission_fixed_cents: 15000 })
    .eq("reseller_id", seller.id);
  const name = `Cliente Fixo ${stamp()}`;
  const { data: company } = await admin.from("companies").insert({ name, slug: `usa-${stamp()}` }).select("id").single();
  const { data: plan } = await admin.from("plans").select("id").eq("code", "pro").single();
  await admin.rpc("link_company_to_reseller", {
    p_company_id: company!.id,
    p_reseller_id: seller.id,
    p_plan_id: plan!.id,
    p_external_subscription_id: null,
  });
  await admin.rpc("register_commission", {
    p_company_id: company!.id,
    p_gateway: "fake",
    p_external_payment_id: `fixo-${company!.id}`,
    p_base_amount_cents: 49900,
    p_months_covered: 1,
  });
  await page.goto(`/admin/revendedores/lancamentos?reseller=${seller.id}`);
  const row = page.locator("li", { hasText: name });
  await expect(row.getByText("R$ 150,00 fixo por pagamento")).toBeVisible();
  await expect(row.getByText("sobre")).toHaveCount(0);
  await page.goto(`/admin/revendedores/${seller.id}`);
  await expect(page.getByText("R$ 150,00 fixo por pagamento")).toBeVisible();
});

test("Vincular agora no alerta: vale só para os próximos pagamentos", async ({ page }) => {
  const code = `alerta-${stamp()}`;
  const { data: seller } = await admin
    .from("resellers")
    .insert({ name: `Alerta ${code}`, email: `${code}@e2e.local`, referral_code: code })
    .select("id")
    .single();
  const { data: plan } = await admin.from("plans").select("id").eq("code", "pro").single();
  const name = `Cliente Sem Regra ${stamp()}`;
  const { data: company } = await admin.from("companies").insert({ name, slug: `usa-${stamp()}` }).select("id").single();
  await admin.from("reseller_audit_log").insert({
    table_name: "reseller_clients",
    record_id: company!.id,
    action: "LINK_NO_RULE",
    new_values: { reseller_id: seller!.id, plan_id: plan!.id, sale_number: 1 },
  });
  await admin
    .from("commission_rules")
    .insert({ reseller_id: seller!.id, commission_type: "percent", commission_percent: 25 });

  await page.goto("/admin/revendedores/falhas");
  const row = page.locator("div.rounded-lg", { hasText: name });
  await row.getByRole("button", { name: "Vincular agora" }).click();
  await expect(page.getByText("Vale a partir do próximo pagamento")).toBeVisible();
  await expect(row).toHaveCount(0);

  const { data: client } = await admin.from("reseller_clients").select("sale_number").eq("company_id", company!.id).single();
  expect(client!.sale_number).toBeNull();
  const { data: none } = await admin.from("reseller_commissions").select("id").eq("company_id", company!.id);
  expect(none).toHaveLength(0);

  await admin.rpc("register_commission", {
    p_company_id: company!.id,
    p_gateway: "fake",
    p_external_payment_id: `alerta-${company!.id}`,
    p_base_amount_cents: 10000,
    p_months_covered: 1,
  });
  const { data: after } = await admin.from("reseller_commissions").select("amount_cents").eq("company_id", company!.id);
  expect(after).toEqual([{ amount_cents: 2500 }]);
});
