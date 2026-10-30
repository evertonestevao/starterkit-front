import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";
import { admin, makeSuperAdmin, resetModule, setModuleEnabled, setPlansAvailable } from "./reseller-helpers";

/** Exportação do mês e rate limit do link. */

test.afterAll(resetModule);

const EXPORT_PATH = "/admin/revendedores/lancamentos/exportar";

test("CSV: só o super admin baixa, e respeita os filtros da tela", async ({ page, request }) => {
  // Sem sessão: o proxy manda para o login, sem entregar o arquivo.
  const anonymous = await request.get(EXPORT_PATH, { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers().location).toContain("/login");

  const email = uniqueEmail("csv");
  await signupAndOnboard(page, { email, password: PASSWORD, name: "Super CSV", company: "Empresa CSV E2E" });

  const denied = await page.request.get(EXPORT_PATH);
  expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toContain("Vendedor;");

  await makeSuperAdmin(email);
  await setModuleEnabled(true);
  await setPlansAvailable(true);

  const stamp = Date.now();
  const sellers = await Promise.all(
    ["a", "b"].map(async (letter) => {
      const code = `csv-${letter}-${stamp}`;
      const { data: seller } = await admin
        .from("resellers")
        .insert({ name: `CSV ${letter} ${stamp}`, email: `${code}@e2e.local`, referral_code: code })
        .select("id, name")
        .single();
      await admin
        .from("commission_rules")
        .insert({ reseller_id: seller!.id, commission_type: "percent", commission_percent: 10 });
      const { data: company } = await admin
        .from("companies")
        .insert({ name: `Cliente ${code}`, slug: code })
        .select("id")
        .single();
      const { data: plan } = await admin.from("plans").select("id").eq("code", "pro").single();
      await admin.rpc("link_company_to_reseller", {
        p_company_id: company!.id,
        p_reseller_id: seller!.id,
        p_plan_id: plan!.id,
        p_external_subscription_id: null,
      });
      await admin.rpc("register_commission", {
        p_company_id: company!.id,
        p_gateway: "fake",
        p_external_payment_id: code,
        p_base_amount_cents: 10000,
        p_months_covered: 1,
      });
      return seller!;
    }),
  );

  // O botão leva os filtros da tela.
  await page.goto(`/admin/revendedores/lancamentos?reseller=${sellers[0].id}`);
  const href = await page.getByRole("link", { name: /Exportar comissões do mês/ }).getAttribute("href");
  expect(href).toContain(`reseller=${sellers[0].id}`);

  const filtered = await page.request.get(href!);
  expect(filtered.status()).toBe(200);
  expect(filtered.headers()["content-type"]).toContain("text/csv");
  const csv = await filtered.text();
  expect(csv).toContain(sellers[0].name);
  expect(csv).not.toContain(sellers[1].name);
  expect(csv).toContain(`${sellers[0].name};10,00;0,00;10,00`);

  // Sem filtro de vendedor: os dois, com total de cada um.
  const all = await (await page.request.get(EXPORT_PATH)).text();
  expect(all).toContain(`${sellers[0].name};10,00;0,00;10,00`);
  expect(all).toContain(`${sellers[1].name};10,00;0,00;10,00`);

  // Período sem lançamentos.
  const empty = await (await page.request.get(`${EXPORT_PATH}?from=2001-01-01&to=2001-01-31`)).text();
  expect(empty).not.toContain(sellers[0].name);
});

test("rate limit do link: passou do limite, ignora em silêncio, sem cookie", async ({ request }) => {
  await setModuleEnabled(true);
  const code = `limite-${Date.now()}`;
  await admin.from("resellers").insert({ name: "Limite", email: `${code}@e2e.local`, referral_code: code });

  // IP próprio do teste, para não interferir nas outras specs.
  const headers = { "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}` };
  const first = await request.get(`/r/${code}`, { maxRedirects: 0, headers });
  expect(first.headers()["set-cookie"]).toContain("reseller_ref=");

  for (let i = 0; i < 120; i++) {
    await request.get("/r/nao-existe", { maxRedirects: 0, headers });
  }
  const blocked = await request.get(`/r/${code}`, { maxRedirects: 0, headers });
  expect(blocked.status()).toBe(307);
  expect(blocked.headers().location).toBe("/");
  expect(blocked.headers()["set-cookie"]).toBeUndefined();
});
