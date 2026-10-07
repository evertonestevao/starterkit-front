import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Fluxo crítico 2: criar igreja → convidar membro para o sistema.
 *
 * O convite é feito no cadastro do membro (Membros → Novo membro, com e-mail
 * e "Convidar para acessar o sistema"); a página do membro mostra o convite
 * pendente e deixa cancelar.
 */
test("responsável convida um membro e cancela o convite pendente", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("owner"),
    password: PASSWORD,
    name: "Owner E2E",
    company: "Empresa Convites E2E",
  });

  await page.getByRole("link", { name: "Membros", exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/membros/);

  const convidado = uniqueEmail("convidado");
  await page.getByRole("button", { name: "Novo membro" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome", { exact: true }).fill("Convidado E2E");
  await dialogo.getByLabel("E-mail (opcional)").fill(convidado);
  await dialogo.getByRole("checkbox", { name: /Convidar para acessar o sistema/ }).check();
  await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText(new RegExp(`convite enviado para ${convidado}`))).toBeVisible();

  // Na página do membro, o convite aparece pendente e pode ser cancelado.
  await page.getByRole("link", { name: "Ver a ficha de Convidado E2E" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/membros\/[0-9a-f-]{36}/);
  await expect(page.getByText("Convite enviado").first()).toBeVisible();
  await page.getByRole("button", { name: "Cancelar convite" }).click();
  await expect(page.getByText("Convite cancelado.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar convite" })).toBeHidden();
});
