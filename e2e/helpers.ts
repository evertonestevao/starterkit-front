import { expect, type Page } from "@playwright/test";

/** Cria conta nova + primeira igreja (empresa) e chega ao dashboard. */
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

  // onboarding: aceite dos termos vigentes + primeira empresa
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText("Cadastre sua igreja")).toBeVisible();
  await page.getByLabel("Nome da igreja").fill(company);
  await page.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await page.getByRole("button", { name: "Criar igreja" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: company })).toBeVisible();
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@e2e.local`;
}

export const PASSWORD = "senha-e2e-12345";

/**
 * Descobre o link de convite de patrocínio da igreja da empresa ativa.
 * Sai da própria tela de Configurações → Domínio próprio, que é de onde o
 * pastor copiaria — assim o teste falha se esse caminho sumir.
 */
export async function getSponsorInviteUrl(page: Page): Promise<string> {
  await page.goto("/dashboard/settings/domain");
  const link = page.locator("text=/\/patrocinador\/patrocinar\//").first();
  await expect(link).toBeVisible();
  const text = (await link.textContent()) ?? "";
  const match = text.match(/https?:\/\/[^\s]+\/patrocinador\/patrocinar\/[a-z0-9-]+/);
  if (!match) throw new Error(`link de patrocinio nao encontrado em: ${text}`);
  return match[0];
}

/** Caminho relativo do convite, para navegar sem depender do host. */
export function invitePath(inviteUrl: string): string {
  return new URL(inviteUrl).pathname;
}
