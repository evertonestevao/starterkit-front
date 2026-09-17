import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/** Fluxo crítico 2: criar empresa → convidar membro (plano §12). */
test("owner convida membro e vê o convite pendente", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("owner"),
    password: PASSWORD,
    name: "Owner E2E",
    company: "Empresa Convites E2E",
  });

  await page.getByRole("link", { name: "Pessoas" }).click();
  await expect(page).toHaveURL(/\/dashboard\/members/);

  const invitedEmail = uniqueEmail("convidado");
  await page.getByLabel("Email").fill(invitedEmail);
  await page.getByLabel("Papel").selectOption("member");
  await page.getByRole("button", { name: "Enviar convite" }).click();

  await expect(page.getByText("Convite enviado")).toBeVisible();
  await expect(page.getByText(invitedEmail)).toBeVisible();

  // revogação
  await page.getByRole("button", { name: `Revogar convite de ${invitedEmail}` }).click();
  await expect(page.getByText("Convite revogado")).toBeVisible();
  await expect(page.getByText(invitedEmail)).toBeHidden();
});
