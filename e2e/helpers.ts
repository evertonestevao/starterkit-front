import { execFileSync } from "node:child_process";
import { expect, type Browser, type Page } from "@playwright/test";

/** Cria conta nova + primeira igreja (empresa) e chega ao dashboard. */
export async function signupAndOnboard(
  page: Page,
  {
    email,
    password,
    name,
    company,
    publicarPagina = true,
  }: {
    email: string;
    password: string;
    name: string;
    company: string;
    /** false para testar a igreja recém-criada, ainda fora do ar. */
    publicarPagina?: boolean;
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

  // Igreja nova nasce com a página fora do ar: os fluxos que usam a página
  // pública começam com ela publicada, pelo botão dos "Primeiros passos".
  if (publicarPagina) {
    await page.getByRole("button", { name: "Colocar a página no ar" }).click();
    await expect(page.getByText("Página no ar!")).toBeVisible();
  }
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

/**
 * A chave Pix só aparece na página depois que a moderação aprova. Este helper
 * faz o caminho de verdade: cria uma conta, promove-a com o script real
 * (`add-platform-staff.mjs`, o mesmo de produção), abre a fila em
 * /plataforma/pix e aprova a chave da igreja de código `publicCode`. A conta é
 * rebaixada no fim, passe ou falhe.
 */
export async function aprovarPixComoModeracao(browser: Browser, publicCode: string): Promise<void> {
  const email = uniqueEmail("moderacao-pix");
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  try {
    await pagina.goto("/signup");
    await pagina.getByLabel("Nome completo").fill("Moderação Pix E2E");
    await pagina.getByLabel("Email").fill(email);
    await pagina.getByLabel("Senha").fill(PASSWORD);
    await pagina.getByRole("button", { name: "Criar conta" }).click();
    await expect(pagina).toHaveURL(/\/onboarding/);
    execFileSync("node", ["scripts/add-platform-staff.mjs", email], { stdio: "pipe" });

    await pagina.goto("/plataforma/pix");
    // Pela página (única), não pelo nome: execuções antigas deixam igrejas homônimas na fila.
    const cartao = pagina.getByRole("listitem").filter({ hasText: `/igreja/${publicCode}` });
    await expect(cartao).toBeVisible();
    await cartao.getByRole("button", { name: "Aprovar" }).click();
    await expect(pagina.getByText(/Chave aprovada/)).toBeVisible();
  } finally {
    try {
      execFileSync("node", ["scripts/add-platform-staff.mjs", email, "--remover"], { stdio: "pipe" });
    } catch {
      // Conta que nem chegou a ser promovida: nada a desfazer.
    }
    await contexto.close();
  }
}
