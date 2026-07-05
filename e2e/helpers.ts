import { expect, type Page } from "@playwright/test";

/** Cria conta nova + primeira empresa e chega ao dashboard. */
export async function signupAndOnboard(
  page: Page,
  { email, password, name, company }: {
    email: string;
    password: string;
    name: string;
    company: string;
  },
) {
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();

  // onboarding: primeira empresa
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText("Crie sua empresa")).toBeVisible();
  await page.getByLabel("Nome da empresa").fill(company);
  await page.getByRole("button", { name: "Criar empresa" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.local`;
}

export const PASSWORD = "senha-e2e-12345";
