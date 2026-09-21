import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Programação: adicionar culto "toda semana" e "data específica", e a
 * mensagem de uma tentativa não pode sobreviver à troca de modo.
 *
 * O bug real que isto protege: um erro de quando o formulário estava em
 * "Data específica" continuava na tela depois de trocar para "Toda semana"
 * (ou vice-versa), parecendo um problema do modo atual — que nem chegou a
 * ser enviado ainda.
 */
test("adiciona culto nos dois modos, e a mensagem não fica presa ao trocar de modo", async ({
  page,
}) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-prog"),
    password: PASSWORD,
    name: "Pastor Programacao E2E",
    company: "Igreja Programacao E2E",
  });

  await page.goto("/dashboard/programacao");

  // 1. Toda semana: caminho normal, com o dia padrão (Domingo).
  await page.locator("#titulo").fill("Culto de celebração");
  await page.locator("#hora").fill("18:00");
  await page.getByRole("button", { name: "Adicionar à programação" }).click();
  await expect(page.getByText(/entrou na programação/)).toBeVisible();
  await expect(page.getByText("Culto de celebração", { exact: true })).toBeVisible();

  // 2. Provoca um erro de verdade em "Data específica": uma data no passado.
  await page.locator("fieldset").getByText("Data específica", { exact: true }).click();
  await page.locator("#data").fill("2020-01-01");
  await page.locator("#hora").fill("19:00");
  await page.locator("#titulo").fill("Culto que já passou");
  await page.getByRole("button", { name: "Adicionar à programação" }).click();
  const erro = page.getByText("A data do culto especial já passou.");
  await expect(erro).toBeVisible();

  // 3. Troca para "Toda semana": a mensagem de erro da tentativa anterior
  //    (de quando o modo era "Data específica") precisa sumir, mesmo sem
  //    reenviar nada — ela não faz sentido nesse modo.
  await page.locator("fieldset").getByText("Toda semana", { exact: true }).click();
  await expect(erro).toHaveCount(0);

  // 4. E o cadastro em "Toda semana" funciona normalmente a partir daqui.
  await page.locator("#titulo").fill("Estudo bíblico");
  await page.locator("#hora").fill("19:30");
  await page.getByRole("button", { name: "Adicionar à programação" }).click();
  await expect(page.getByText(/entrou na programação/)).toBeVisible();
  await expect(page.getByText("Estudo bíblico", { exact: true })).toBeVisible();
});
