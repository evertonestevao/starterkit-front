import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./helpers";

/**
 * A moderação da plataforma não é uma igreja sem cadastro.
 *
 * O cadastro público leva todo mundo ao onboarding ("Cadastre sua igreja"),
 * e o dashboard exigia aceitar os termos DAS IGREJAS antes de qualquer coisa.
 * Resultado: quem modera caía num formulário pedindo nome de igreja. Este
 * teste usa o script real de promoção, o mesmo que se roda em produção.
 */
let onTestEnd: (() => void) | null = null;

test.afterEach(() => {
  onTestEnd?.();
  onTestEnd = null;
});

test("moderação entra direto na área dela, sem virar igreja", async ({ page }) => {
  const email = uniqueEmail("moderacao");

  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill("Moderação E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Promovida com service_role pelo script — ninguém se promove pela app.
  execFileSync("node", ["scripts/add-platform-staff.mjs", email], { stdio: "pipe" });
  // Rebaixada no fim, passe ou falhe: os alertas da fila vão para TODA a
  // moderação, e cada execução deixaria um endereço falso recebendo email.
  onTestEnd = () =>
    execFileSync("node", ["scripts/add-platform-staff.mjs", email, "--remover"], {
      stdio: "pipe",
    });

  // O onboarding não segura mais quem modera...
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/plataforma$/);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  // Os números da visão geral são MEDIDOS (a amostra saiu do ar): o que a
  // tela promete é patrocínio e alcance de verdade.
  await expect(page.getByText("Patrocinadores pagantes")).toBeVisible();
  await expect(page.getByText("Números medidos, sem amostra.")).toBeVisible();

  // ...nem o dashboard, que antes mandava aceitar os termos das igrejas.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/plataforma$/);

  // E dá para sair — o painel nasceu sem botão de logout.
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("quem não é moderação não enxerga a área da plataforma", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Nome completo").fill("Comum E2E");
  await page.getByLabel("Email").fill(uniqueEmail("comum"));
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // 404, não "acesso negado": quem não modera não precisa saber que existe.
  const resposta = await page.goto("/plataforma/alteracoes");
  expect(resposta?.status()).toBe(404);
});
