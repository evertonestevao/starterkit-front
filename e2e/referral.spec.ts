import { createClient } from "@supabase/supabase-js";
import { expect, test, type BrowserContext } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/** Link de afiliado (plano §5). Códigos novos a cada teste: a validação tem cache. */

const admin = createClient(
  process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321",
  // Demo key pública e fixa do Supabase CLI, a mesma de playwright.config.ts.
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  { auth: { persistSession: false } },
);

async function setModuleEnabled(enabled: boolean) {
  const { error } = await admin
    .from("reseller_settings")
    .update({ resellers_enabled: enabled })
    .eq("singleton", true);
  expect(error).toBeNull();
}

async function createReseller(overrides: { email?: string; status?: string } = {}) {
  const code = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const { data, error } = await admin
    .from("resellers")
    .insert({
      name: "Vendedor E2E",
      email: overrides.email ?? `${code}@e2e.local`,
      referral_code: code,
      status: overrides.status ?? "active",
    })
    .select("id, referral_code")
    .single();
  expect(error).toBeNull();
  return data!;
}

async function referralCookie(context: BrowserContext) {
  return (await context.cookies()).find((cookie) => cookie.name === "reseller_ref");
}

async function referralsOf(resellerId: string) {
  const { data, error } = await admin
    .from("reseller_referrals")
    .select("company_id, referral_code")
    .eq("reseller_id", resellerId);
  expect(error).toBeNull();
  return data!;
}

test.beforeEach(() => setModuleEnabled(true));
test.afterAll(() => setModuleEnabled(false));

test("link grava cookie, limpa a URL e o cadastro guarda o código", async ({ page, context }) => {
  const reseller = await createReseller();

  await page.goto(`/r/${reseller.referral_code}`);
  await expect(page).toHaveURL(/localhost:3000\/$/);

  const cookie = await referralCookie(context);
  expect(cookie?.value).toBe(reseller.referral_code);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  const days = (cookie!.expires - Date.now() / 1000) / 86_400;
  expect(days).toBeGreaterThan(29);
  expect(days).toBeLessThanOrEqual(30);

  await signupAndOnboard(page, {
    email: uniqueEmail("indicado"),
    password: PASSWORD,
    name: "Cliente Indicado",
    company: "Empresa Indicada E2E",
  });

  const referrals = await referralsOf(reseller.id);
  expect(referrals).toHaveLength(1);
  expect(referrals[0].referral_code).toBe(reseller.referral_code);

  // Só o cadastro: o vínculo com comissão nasce na contratação.
  const { data: clients } = await admin
    .from("reseller_clients")
    .select("id")
    .eq("company_id", referrals[0].company_id);
  expect(clients).toHaveLength(0);
});

test("?ref= grava o cookie e preserva os demais parâmetros", async ({ page, context }) => {
  const reseller = await createReseller();

  await page.goto(`/?ref=${reseller.referral_code}&utm_source=meta&utm_campaign=teste`);
  await expect(page).toHaveURL(/localhost:3000\/\?utm_source=meta&utm_campaign=teste$/);
  expect((await referralCookie(context))?.value).toBe(reseller.referral_code);

  await context.clearCookies();
  await page.goto(`/signup?ref=${reseller.referral_code}`);
  await expect(page).toHaveURL(/\/signup$/);
  expect((await referralCookie(context))?.value).toBe(reseller.referral_code);
});

test("vale o primeiro vendedor", async ({ page, context }) => {
  const first = await createReseller();
  const second = await createReseller();

  await page.goto(`/r/${first.referral_code}`);
  await page.goto(`/r/${second.referral_code}`);
  await expect(page).toHaveURL(/localhost:3000\/$/);
  expect((await referralCookie(context))?.value).toBe(first.referral_code);
});

test("código inválido e vendedor suspenso são ignorados, com a mesma resposta", async ({
  page,
  context,
  request,
}) => {
  const valid = await createReseller();
  const suspended = await createReseller({ status: "suspended" });

  for (const code of ["nao-existe-e2e", suspended.referral_code, "codigo;invalido"]) {
    await page.goto(`/r/${encodeURIComponent(code)}`);
    await expect(page).toHaveURL(/localhost:3000\/$/);
    expect(await referralCookie(context)).toBeUndefined();
  }

  const responses = await Promise.all(
    [valid.referral_code, "nao-existe-e2e-2"].map((code) =>
      request.get(`/r/${code}?utm_source=x`, { maxRedirects: 0 }),
    ),
  );
  expect(responses[0].status()).toBe(307);
  expect(responses[1].status()).toBe(307);
  expect(responses[0].headers().location).toBe(responses[1].headers().location);
  expect(await responses[1].text()).toBe(await responses[0].text());
});

test("módulo desligado ignora o link", async ({ page, context }) => {
  const reseller = await createReseller();
  await setModuleEnabled(false);

  await page.goto(`/r/${reseller.referral_code}`);
  await expect(page).toHaveURL(/localhost:3000\/$/);
  expect(await referralCookie(context)).toBeUndefined();
});

test("auto-indicação: vendedor com o mesmo e-mail não fica no próprio cadastro", async ({
  page,
  context,
}) => {
  const email = uniqueEmail("auto");
  const reseller = await createReseller({ email });

  await page.goto(`/r/${reseller.referral_code}`);
  expect((await referralCookie(context))?.value).toBe(reseller.referral_code);

  await signupAndOnboard(page, {
    email,
    password: PASSWORD,
    name: "Vendedor Comprando",
    company: "Auto Indicacao E2E",
  });

  expect(await referralsOf(reseller.id)).toHaveLength(0);
});
