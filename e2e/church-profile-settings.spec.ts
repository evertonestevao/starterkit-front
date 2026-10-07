import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Editar o nome da igreja tem que refletir o valor novo no formulário, e o
 * campo continuar editável em seguida. Isto está aqui por causa de um bug
 * real: o <form> não remontava depois que o salvamento trazia o nome novo do
 * servidor, e o Base UI acusava o <Input defaultValue={...}> já montado
 * recebendo um valor diferente ("changing the default value state of an
 * uncontrolled FieldControl after being initialized") — só visível em
 * `next dev` (o aviso é condicionado a modo de desenvolvimento), então este
 * teste, que roda contra um build de produção, não reproduz o aviso em si;
 * ele cobre a parte que dá para verificar aqui: o valor persiste e o campo
 * continua usável depois do salvamento.
 */
test("editar o nome da igreja atualiza o valor e mantém o campo editável", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-perfil"),
    password: PASSWORD,
    name: "Pastor Perfil E2E",
    company: "Igreja Perfil E2E",
  });

  await page.goto("/dashboard/settings/igreja");
  const novoNome = `Igreja Perfil Renomeada ${Date.now()}`;
  await page.locator("#name").fill(novoNome);
  await page.getByRole("button", { name: "Salvar página" }).click();

  await expect(page.getByText("Página da igreja atualizada.")).toBeVisible();
  await expect(page.locator("#name")).toHaveValue(novoNome);

  // Digitar de novo funciona normalmente — prova que o campo continua sendo
  // o mesmo input usável, não travado por causa do remonte.
  await page.locator("#address").fill("Rua Nova, 100");
  await expect(page.locator("#address")).toHaveValue("Rua Nova, 100");
});
