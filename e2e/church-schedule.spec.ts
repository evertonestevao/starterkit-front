import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Programação: adicionar culto "toda semana" e "data específica", cada
 * envio (sucesso ou erro) avisando por toast. Trocar de modo depois de um
 * erro não pode travar o formulário — o toast antigo só some sozinho,
 * decorativo, e não impede um novo envio no modo atual.
 */
test("adiciona culto nos dois modos, e um erro num modo não trava o envio no outro", async ({
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
  await expect(page.getByText("A data do culto especial já passou.")).toBeVisible();

  // 3. Troca para "Toda semana" e envia com sucesso — o aviso de erro do
  //    envio anterior (de outro modo) não impede nem se mistura com este.
  await page.locator("fieldset").getByText("Toda semana", { exact: true }).click();
  await page.locator("#titulo").fill("Estudo bíblico");
  await page.locator("#hora").fill("19:30");
  await page.getByRole("button", { name: "Adicionar à programação" }).click();
  await expect(page.getByText(/entrou na programação/).last()).toBeVisible();
  await expect(page.getByText("Estudo bíblico", { exact: true })).toBeVisible();
});

/**
 * Editar um item já cadastrado tem que refletir o valor novo e deixar o
 * formulário usável em seguida. Mesmo bug do formulário de perfil da igreja:
 * o <form> de edição não remontava depois que o salvamento trazia os dados
 * novos do servidor, e o Base UI acusava os <Input defaultValue=...> já
 * montados recebendo um valor diferente — aviso que só aparece em
 * `next dev`, então não dá para reproduzi-lo aqui (este teste roda contra um
 * build de produção); o que dá para verificar é que o valor persiste depois
 * do salvamento.
 */
test("editar um culto já cadastrado atualiza o valor exibido", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-prog-edit"),
    password: PASSWORD,
    name: "Pastor Programacao Edit E2E",
    company: "Igreja Programacao Edit E2E",
  });

  await page.goto("/dashboard/programacao");
  await page.locator("#titulo").fill("Culto de oração");
  await page.locator("#hora").fill("20:00");
  await page.getByRole("button", { name: "Adicionar à programação" }).click();
  await expect(page.getByText(/entrou na programação/)).toBeVisible();

  await page.getByText("Editar", { exact: true }).click();
  const edicao = page.locator("details");
  const novoTitulo = `Culto de oração renomeado ${Date.now()}`;
  await edicao.getByLabel("Nome").fill(novoTitulo);
  await edicao.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page.getByText(/atualizado/)).toBeVisible();
  await expect(page.getByText(novoTitulo, { exact: true })).toBeVisible();
});
