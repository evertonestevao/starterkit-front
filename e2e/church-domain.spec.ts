import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Fluxo crítico: domínio próprio. Roda com o provedor fake, que exige um
 * "Verificar agora" antes de ativar — mesmo ciclo do provedor real, sem DNS.
 */
test("igreja cadastra domínio, vê as instruções de DNS e ativa", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-dominio"),
    password: PASSWORD,
    name: "Pastor Dominio E2E",
    company: "Igreja Dominio E2E",
  });

  await page.goto("/dashboard/settings/domain");

  // O endereço padrão existe desde sempre e não depende de configuração.
  await expect(page.getByText("Endereço padrão", { exact: true })).toBeVisible();
  await expect(page.getByText("Não configurado")).toBeVisible();

  const dominio = `e2e-${Date.now()}.com.br`;
  await page.getByLabel("Seu domínio").fill(dominio);
  await page.getByRole("button", { name: "Cadastrar" }).click();

  // Registros de DNS aparecem para a igreja copiar.
  await expect(page.getByText("Registros de DNS", { exact: true })).toBeVisible();
  await expect(page.getByText("Aguardando DNS")).toBeVisible();
  // Domínio raiz recebe registro A (não CNAME) — regra que quebra em .com.br.
  await expect(page.getByRole("cell", { name: "A", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Verificar agora" }).click();
  await expect(page.getByText("Ativo", { exact: true })).toBeVisible();
});

test("domínio reservado é recusado com mensagem clara", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-reservado"),
    password: PASSWORD,
    name: "Pastor Reservado E2E",
    company: "Igreja Reservado E2E",
  });

  await page.goto("/dashboard/settings/domain");
  // Host de infraestrutura nossa: é hostname válido, então passa pelo formato
  // e tem de ser barrado pela regra de reservados — aceitar sequestraria
  // tráfego da plataforma.
  await page.getByLabel("Seu domínio").fill("igreja-e2e.vercel.app");
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText("Este domínio é reservado e não pode ser usado como domínio próprio.")).toBeVisible();
});
