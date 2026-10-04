import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * EBD de ponta a ponta, do jeito que a igreja usa no domingo: cria a classe,
 * põe DOIS professores (revezamento é o normal), matricula alunos, faz a
 * chamada e confere que o resumo e o relatório em PDF mostram os números.
 *
 * É o fluxo que não pode quebrar sem ninguém perceber: uma chamada que não
 * salva some com o domingo inteiro de uma classe.
 */

async function novoMembro(page: Page, nome: string) {
  await page.getByRole("button", { name: "Novo membro" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome", { exact: true }).fill(nome);
  await dialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText(nome).first()).toBeVisible();
}

async function adicionarProfessor(page: Page, nome: string) {
  await page.getByRole("button", { name: "Adicionar professor" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByPlaceholder("Nome da pessoa").fill(nome);
  await dialogo.locator("li", { hasText: nome }).getByRole("button", { name: "Escolher" }).click();
  await expect(dialogo).toBeHidden();
}

async function novoAluno(page: Page, nome: string) {
  await page.getByRole("button", { name: "Novo aluno" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome", { exact: true }).fill(nome);
  await dialogo.getByRole("button", { name: "Matricular" }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByText(nome).first()).toBeVisible();
}

test("classe com dois professores, chamada salva e relatório do domingo", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-ebd"),
    password: PASSWORD,
    name: "Pastor EBD E2E",
    company: "Igreja EBD E2E",
  });

  // 1. Dois membros que vão dar aula (professor é escolhido entre os membros).
  await page.goto("/dashboard/membros");
  await novoMembro(page, "Marta Professora");
  await novoMembro(page, "Paulo Professor");

  // 2. Classe.
  await page.goto("/dashboard/ebd");
  await page.getByRole("button", { name: "Nova classe" }).click();
  const classeDialogo = page.getByRole("dialog");
  await classeDialogo.getByLabel("Nome", { exact: true }).fill("Juniores");
  await classeDialogo.getByRole("button", { name: "Salvar" }).click();
  await expect(classeDialogo).toBeHidden();
  await page.getByRole("link", { name: /Juniores/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/ebd\/classes\/[0-9a-f-]{36}$/);

  // 3. Dois professores na mesma classe.
  await adicionarProfessor(page, "Marta Professora");
  await adicionarProfessor(page, "Paulo Professor");
  await expect(page.getByRole("button", { name: "Tirar Marta Professora de professor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tirar Paulo Professor de professor" })).toBeVisible();

  // 4. Dois alunos.
  await novoAluno(page, "Ana Aluna");
  await novoAluno(page, "Beto Aluno");

  // 5. Chamada: uma presente, um ausente, com bíblia e oferta.
  await page.goto("/dashboard/ebd");
  await page.getByRole("link", { name: "Chamada", exact: true }).first().click();
  await expect(page).toHaveURL(/\/chamada\?data=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByText("Nova chamada")).toBeVisible();
  await page.getByRole("radiogroup", { name: "Presença de Ana Aluna" }).getByRole("radio", { name: "Presente" }).click();
  await page.getByRole("radiogroup", { name: "Presença de Beto Aluno" }).getByRole("radio", { name: "Ausente" }).click();
  await page.getByLabel("Oferta (R$)").fill("12,50");
  await page.getByRole("button", { name: "Salvar chamada" }).click();
  await expect(page.getByText(/Chamada da classe salva/)).toBeVisible();
  // Reabrir a mesma data cai em edição, não em chamada nova.
  await expect(page.getByText("Já feita — editando")).toBeVisible();

  // 6. O resumo do domingo reflete a chamada, com os dois professores na classe.
  await page.goto("/dashboard/ebd");
  await expect(page.getByText("1 de 1 classe(s) com chamada")).toBeVisible();
  await expect(page.getByText("de 2 matriculados")).toBeVisible();
  await expect(page.getByText("Prof.: Marta Professora, Paulo Professor")).toBeVisible();

  // 7. Relatório para PDF: mesmos números, e o menu não sai na folha.
  await page.getByRole("link", { name: "Gerar PDF" }).click();
  await expect(page).toHaveURL(/\/dashboard\/ebd\/relatorio\?data=/);
  const folha = page.locator("article");
  await expect(folha.getByRole("heading", { name: "Igreja EBD E2E" })).toBeVisible();
  await expect(folha.getByText("Prof.: Marta Professora, Paulo Professor")).toBeVisible();
  await expect(folha.getByText("50%", { exact: true }).first()).toBeVisible();
  await expect(folha.getByText("R$ 12,50").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar em PDF" })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("aside")).toBeHidden();
  await expect(page.getByRole("button", { name: "Salvar em PDF" })).toBeHidden();
  await expect(folha).toBeVisible();
});
