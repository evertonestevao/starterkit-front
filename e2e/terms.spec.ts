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
  await page.getByLabel("Nome da igreja").fill("Empresa Sem Termos");
  await page.getByRole("button", { name: "Criar igreja" }).click();
  await expect(page).toHaveURL(/\/onboarding/); // não navegou

  // o consentimento de email é OPCIONAL: aceita só os termos e avança
  await checkbox.check();
  await page.getByRole("button", { name: "Criar igreja" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("cada público abre o seu contrato, e um leva ao outro", async ({ page }) => {
  // O endereço antigo continua valendo: há aceites registrados apontando para
  // ele e emails já enviados com esse link.
  await page.goto("/terms");
  await expect(page).toHaveURL(/\/terms\/igreja/);
  await expect(page.getByRole("heading", { name: "Termos de Uso — Igrejas" })).toBeVisible();

  // A igreja não paga: se esta frase sumir, o contrato mudou de sentido.
  await expect(page.getByText(/uso da Plataforma pela Igreja é gratuito/i)).toBeVisible();

  await page.getByRole("link", { name: /Veja os termos do patrocínio/i }).click();
  await expect(page).toHaveURL(/\/terms\/patrocinador/);
  await expect(
    page.getByRole("heading", { name: "Termos de Uso — Patrocinadores" }),
  ).toBeVisible();

  // A cláusula que sustenta o produto inteiro: o dinheiro não é da igreja.
  await expect(page.getByText(/não é doação, dízimo, oferta nem repasse/i)).toBeVisible();
  // E a tabela de preços precisa renderizar como tabela, não como texto cru.
  await expect(page.getByRole("cell", { name: "R$ 39,90" })).toBeVisible();
});
