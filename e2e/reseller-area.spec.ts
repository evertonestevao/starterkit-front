import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";
import { admin, resetModule, setModuleEnabled, setPlansAvailable } from "./reseller-helpers";

/** Área /vendedor: isolamento entre vendedores e em relação aos tenants. */

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function acceptCurrentTerms(userId: string) {
  const { data: terms } = await admin.from("terms_versions").select("id").eq("is_current", true).single();
  await admin.from("terms_acceptances").insert({ user_id: userId, terms_version_id: terms!.id });
}

/** Vendedor pronto para entrar: conta, termos aceitos, cadastro e regra de 30%. */
async function createSeller() {
  const email = uniqueEmail("seller");
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  expect(error).toBeNull();
  const userId = data.user!.id;
  await acceptCurrentTerms(userId);
  const code = `seller-${unique()}`;
  const { data: reseller } = await admin
    .from("resellers")
    .insert({ name: `Vendedor ${code}`, email, referral_code: code, user_id: userId })
    .select("id, referral_code")
    .single();
  await admin
    .from("commission_rules")
    .insert({ reseller_id: reseller!.id, commission_type: "percent", commission_percent: 30 });
  return { email, userId, id: reseller!.id, code };
}

/** Cliente vendido por este vendedor, com um lançamento pendente. */
async function createClientFor(resellerId: string, name: string) {
  const { data: company } = await admin
    .from("companies")
    .insert({ name, slug: `area-${unique()}` })
    .select("id")
    .single();
  const { data: plan } = await admin.from("plans").select("id").eq("code", "pro").single();
  const { error } = await admin.rpc("link_company_to_reseller", {
    p_company_id: company!.id,
    p_reseller_id: resellerId,
    p_plan_id: plan!.id,
    p_external_subscription_id: null,
  });
  expect(error).toBeNull();
  const paymentId = `area-${company!.id}`;
  await admin.rpc("register_commission", {
    p_company_id: company!.id,
    p_gateway: "fake",
    p_external_payment_id: paymentId,
    p_base_amount_cents: 10000,
    p_months_covered: 1,
  });
  return { companyId: company!.id, paymentId };
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.beforeEach(async () => {
  await setModuleEnabled(true);
  await setPlansAvailable(true);
});
test.afterAll(resetModule);

test("dois vendedores: login cai em /vendedor e um não enxerga nada do outro", async ({ page }) => {
  const sellerA = await createSeller();
  const sellerB = await createSeller();
  const nameA = `Cliente de A ${unique()}`;
  const nameB = `Cliente de B ${unique()}`;
  const clientA = await createClientFor(sellerA.id, nameA);
  const clientB = await createClientFor(sellerB.id, nameB);

  await login(page, sellerA.email);
  await expect(page).toHaveURL(/\/vendedor$/);
  await expect(page.getByRole("heading", { name: "Meu link" })).toBeVisible();
  await expect(page.getByText(`/r/${sellerA.code}`, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(sellerB.code)).toHaveCount(0);

  await page.goto("/vendedor/clientes");
  await expect(page.getByText(nameA)).toBeVisible();
  await expect(page.getByText("Venda nº")).toBeVisible();
  await expect(page.getByText(nameB)).toHaveCount(0);

  await page.goto("/vendedor/comissoes");
  await expect(page.getByText(nameA)).toBeVisible();
  await expect(page.getByText("R$ 30,00").first()).toBeVisible();
  await expect(page.getByText(nameB)).toHaveCount(0);

  // Sem empresa: dashboard devolve para a área dele; painel do admin é negado.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/vendedor$/);
  await page.goto("/admin/revendedores");
  await expect(page).toHaveURL(/\/vendedor$/);

  // Direto na API, com a sessão dele: nada de tenants, tabelas internas nem do vendedor B.
  const api = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await api.auth.signInWithPassword({ email: sellerA.email, password: PASSWORD });
  expect(error).toBeNull();

  for (const table of [
    "companies",
    "company_members",
    "subscriptions",
    "settings",
    "audit_logs",
    "company_invites",
    "resellers",
    "commission_rules",
    "reseller_clients",
    "reseller_commissions",
    "reseller_referrals",
    "reseller_audit_log",
    "reseller_commission_failures",
    "reseller_settings",
    "reseller_admin_totals",
    "reseller_admin_clients",
    "reseller_admin_commissions",
    "reseller_admin_link_alerts",
    "platform_admins",
  ]) {
    const { data } = await api.from(table).select("*");
    expect(data ?? [], `tabela ${table}`).toEqual([]);
  }

  const { data: myClients } = await api.from("reseller_my_clients").select("client_name");
  expect(myClients).toEqual([{ client_name: nameA }]);
  const { data: myCommissions } = await api.from("reseller_my_commissions").select("client_name");
  expect(myCommissions).toEqual([{ client_name: nameA }]);

  // Não forja lançamento, não marca como pago.
  const forged = await api.rpc("register_commission", {
    p_company_id: clientB.companyId,
    p_gateway: "fake",
    p_external_payment_id: "forjado",
    p_base_amount_cents: 999999,
  });
  expect(forged.error).not.toBeNull();
  await api.from("reseller_commissions").update({ status: "paid" }).eq("external_payment_id", clientA.paymentId);
  const { data: stillPending } = await admin
    .from("reseller_commissions")
    .select("status")
    .eq("external_payment_id", clientA.paymentId)
    .single();
  expect(stillPending!.status).toBe("pending");
});

test("no celular, as telas do vendedor não têm corte nem rolagem horizontal", async ({ page }) => {
  const seller = await createSeller();
  await createClientFor(seller.id, `Cliente Com Um Nome Bem Comprido Para Testar ${unique()}`);
  await page.setViewportSize({ width: 390, height: 800 });
  await login(page, seller.email);
  await expect(page).toHaveURL(/\/vendedor$/);
  for (const path of ["/vendedor", "/vendedor/clientes", "/vendedor/comissoes", "/vendedor/conta"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
    // Nada fora da tela: todo elemento visível termina dentro dos 390 px.
    const cut = await page.evaluate(() =>
      [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length,
    );
    expect(cut, path).toBe(0);
  }
});

test("módulo desligado bloqueia só o Meu link; suspensão tira o acesso", async ({ page }) => {
  const seller = await createSeller();
  const name = `Cliente Pausa ${unique()}`;
  await createClientFor(seller.id, name);
  await login(page, seller.email);
  await expect(page).toHaveURL(/\/vendedor$/);
  await expect(page.getByRole("button", { name: "Copiar link geral" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar link do plano Pro" })).toBeVisible();

  await setModuleEnabled(false);
  await page.reload();
  await expect(page.getByText("As novas vendas estão pausadas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar link geral" })).toHaveCount(0);
  await page.goto("/vendedor/clientes");
  await expect(page.getByText(name)).toBeVisible();
  await page.goto("/vendedor/comissoes");
  await expect(page.getByText(name)).toBeVisible();

  await admin.from("resellers").update({ status: "suspended" }).eq("id", seller.id);
  for (const path of ["/vendedor", "/vendedor/clientes", "/vendedor/comissoes", "/vendedor/conta"]) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/vendedor/);
  }
  const { data } = await admin.from("reseller_commissions").select("id").eq("reseller_id", seller.id);
  expect(data).toHaveLength(1);
});

test("exclusão bloqueada com comissão pendente; exportação traz a revenda; depois anonimiza", async ({ page }) => {
  const seller = await createSeller();
  const name = `Cliente Conta ${unique()}`;
  const { paymentId } = await createClientFor(seller.id, name);
  await login(page, seller.email);
  await expect(page).toHaveURL(/\/vendedor$/);

  await page.goto("/vendedor/conta");
  await expect(page.getByText(/comissões pendentes/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir minha conta" })).toHaveCount(0);

  const exported = await (await page.request.get("/api/account/export")).json();
  expect(exported.reseller.referralCode).toBe(seller.code);
  expect(exported.reseller.clients[0].clientName).toBe(name);
  expect(exported.reseller.commissions[0].amountCents).toBe(3000);

  await admin
    .from("reseller_commissions")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("external_payment_id", paymentId);
  await page.reload();
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await page.getByLabel("Digite seu email para confirmar").fill(seller.email);
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(page).toHaveURL(/\/$/);

  const { data: anonymized } = await admin
    .from("resellers")
    .select("name, email, user_id, status")
    .eq("id", seller.id)
    .single();
  expect(anonymized!.user_id).toBeNull();
  expect(anonymized!.name).toBe("Vendedor excluído");
  expect(anonymized!.email).not.toContain(seller.email);
  expect(anonymized!.status).toBe("suspended");
  const { data: kept } = await admin.from("reseller_commissions").select("status").eq("external_payment_id", paymentId);
  expect(kept).toEqual([{ status: "paid" }]);
});

test("quem é cliente e vendedor escolhe a área", async ({ page }) => {
  const email = uniqueEmail("ambos");
  await signupAndOnboard(page, { email, password: PASSWORD, name: "Cliente e Vendedor", company: "Empresa Ambos E2E" });
  const { data: userId } = await admin.rpc("find_user_id_by_email", { p_email: email });
  await admin
    .from("resellers")
    .insert({ name: "Ambos", email, referral_code: `ambos-${unique()}`, user_id: userId });

  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, email);
  await expect(page).toHaveURL(/\/escolher-area$/);
  await page.getByRole("link", { name: /Área do vendedor/ }).click();
  await expect(page).toHaveURL(/\/vendedor$/);
  await page.goto("/escolher-area");
  await page.getByRole("link", { name: /Área do cliente/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Empresa Ambos E2E" })).toBeVisible();
});

test("convite: o link define a senha e, depois dos termos, leva a /vendedor", async ({ page }) => {
  const email = uniqueEmail("convidado");
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
  expect(error).toBeNull();
  await admin.from("resellers").insert({
    name: "Convidado",
    email,
    referral_code: `convidado-${unique()}`,
    user_id: data.user!.id,
  });

  await page.goto(`/auth/confirm?token_hash=${data.properties!.hashed_token}&type=invite&next=/reset-password`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("Nova senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();

  await expect(page).toHaveURL(/\/accept-terms$/);
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.locator("form").getByRole("button").click();
  await expect(page).toHaveURL(/\/vendedor$/);
});
