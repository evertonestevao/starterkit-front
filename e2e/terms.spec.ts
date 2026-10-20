import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./helpers";

/** Gate de termos (LGPD): sem aceite não se cria empresa nem entra no app. */
test("onboarding exige aceite dos termos; sem marcar, não avança", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill("Sem Termos E2E");
  await page.getByLabel("Email").fill(uniqueEmail("terms"));
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  const checkbox = page.getByRole("checkbox", { name: /Li e aceito/ });
  await expect(checkbox).toBeVisible();

  // tenta criar SEM aceitar: a validação nativa (required) segura o submit
  await page.getByLabel("Nome da empresa").fill("Empresa Sem Termos");
  await page.getByRole("button", { name: "Criar empresa" }).click();
  await expect(page).toHaveURL(/\/onboarding/); // não navegou

  // o consentimento de email é OPCIONAL: aceita só os termos e avança
  await checkbox.check();
  await page.getByRole("button", { name: "Criar empresa" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("link dos termos abre a versão vigente com aviso de placeholder", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Termos de Uso" })).toBeVisible();
  await expect(page.getByText("TEXTO DE EXEMPLO")).toBeVisible();
});
