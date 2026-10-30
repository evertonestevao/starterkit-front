import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Caminho que passa por service_role e pelos GRANTs do client: assinar (gateway
 * fake simula o webhook), cancelar, assinar de novo, exportar dados e excluir a conta.
 */
test("assinatura, reativação, exportação e exclusão de conta", async ({ page }) => {
  const email = uniqueEmail("billing");

  await signupAndOnboard(page, {
    email,
    password: PASSWORD,
    name: "Usuária Billing",
    company: "Empresa Billing E2E",
  });

  await page.goto("/dashboard/billing");
  await expect(page.getByText("sem assinatura (plano free)")).toBeVisible();

  await page.getByRole("button", { name: "Ativar (dev)" }).first().click();
  await expect(page.getByText("status active")).toBeVisible();

  await page.getByRole("button", { name: "Cancelar assinatura" }).click();
  await expect(page.getByText("status canceled")).toBeVisible();

  await page.getByRole("button", { name: "Ativar (dev)" }).first().click();
  await expect(page.getByText("status active")).toBeVisible();

  await page.getByRole("button", { name: "Cancelar assinatura" }).click();
  await expect(page.getByText("status canceled")).toBeVisible();

  const exported = await page.request.get("/api/account/export");
  expect(exported.status()).toBe(200);
  expect((await exported.json()).account.email).toBe(email);

  await page.goto("/dashboard/settings");
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
  await page.getByLabel("Digite seu email para confirmar").fill(email);
  await page.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email ou senha incorretos")).toBeVisible();
});

test("health check responde sem sessão, lendo o banco como anon", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
});
