import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/** Fluxo crítico 1: login → dashboard (plano §12). */
test("signup, logout e login levam ao dashboard", async ({ page }) => {
  const email = uniqueEmail("auth");

  await signupAndOnboard(page, {
    email,
    password: PASSWORD,
    name: "Usuária E2E",
    company: "Empresa Auth E2E",
  });

  // logout pelo menu do usuário
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  // rota protegida sem sessão volta para login
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  // login → dashboard
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Empresa Auth E2E" })).toBeVisible();
});

test("login com senha errada mostra erro e não navega", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(uniqueEmail("inexistente"));
  await page.getByLabel("Senha").fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email ou senha incorretos")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
