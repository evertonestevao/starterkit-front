import { expect, test } from "@playwright/test";
import { getSponsorInviteUrl, invitePath, PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Campanha por PIX, do começo ao fim: a igreja cria e ativa, a página
 * pública mostra a história e o progresso, um visitante doa (vê o QR com o
 * valor já embutido), o pedido entra como pendente no painel e, só depois de
 * a equipe confirmar, o progresso da campanha sobe.
 *
 * O caminho de cartão (cobrança na Asaas + webhook) não é testado aqui: o
 * redirect final vai para o checkout de um provedor de verdade, que este
 * teste não alcança — mesma limitação de todo o resto do código de
 * pagamento neste projeto.
 */
test("igreja cria e ativa campanha PIX, visitante doa e a equipe confirma", async ({ page, context }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-campanha"),
    password: PASSWORD,
    name: "Pastor Campanha E2E",
    company: "Igreja Campanha E2E",
  });
  const publicCode = invitePath(await getSponsorInviteUrl(page)).split("/").pop()!;

  // A doação PIX de campanha depende da chave PIX da igreja.
  await page.goto("/dashboard/settings/pix");
  await page.getByLabel("Chave PIX").fill("igreja-campanha@e2e.local");
  await page.getByLabel("Nome do titular").fill("Igreja Campanha E2E");
  await page.getByRole("button", { name: "Revisar alteração" }).click();
  await page.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(page.getByText(/Chave PIX salva/)).toBeVisible();

  // 1. Cria a campanha (nasce em rascunho — não aparece na página pública ainda).
  const titulo = `Reforma do telhado ${Date.now()}`;
  await page.goto("/dashboard/campaigns/nova");
  await page.getByLabel("Título").fill(titulo);
  await page.getByLabel("História do projeto").fill("Precisamos trocar o telhado antes das chuvas.");
  await page.getByLabel("Meta (total a arrecadar)").fill("1.000,00");
  await page.getByRole("button", { name: "Criar campanha" }).click();
  await expect(page.getByText(/criada como rascunho/)).toBeVisible();

  // Contexto NOVO de propósito (não context.newPage()): páginas da mesma
  // context compartilham cookies, e o visitante precisa ser de verdade
  // anônimo — é o que prova que rascunho não vaza para quem não é dono.
  const visitorContext = await context.browser()!.newContext();
  const visitante = await visitorContext.newPage();
  await visitante.goto(`/igreja/${publicCode}/campanhas`);
  await expect(visitante.getByText("Nenhuma campanha no momento.")).toBeVisible();

  // 2. Ativa: só agora publica na página.
  await page.goto("/dashboard/campaigns");
  await page.getByText(titulo, { exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/campaigns\/[0-9a-f-]+$/);
  await page.getByRole("button", { name: "Ativar e publicar" }).click();
  await expect(page.getByText(/ativada e publicada/)).toBeVisible();
  const campanhaUrl = page.url();

  // 3. A página pública mostra a campanha, com progresso em 0%.
  await visitante.reload();
  await expect(visitante.getByText(titulo)).toBeVisible();
  await visitante.getByText(titulo).click();
  await expect(visitante.getByText("Precisamos trocar o telhado antes das chuvas.")).toBeVisible();
  await expect(visitante.getByText(/R\$\s*0,00 de R\$\s*1\.000,00/)).toBeVisible();

  // 4. O visitante doa por PIX: preenche os dados, digita o valor e recebe o QR.
  await visitante.getByLabel("Seu nome").fill("Visitante Campanha E2E");
  await visitante.getByLabel("WhatsApp ou telefone").fill("14999997777");
  await visitante.getByPlaceholder("R$ 0,00").fill("150,00");
  await visitante.getByRole("button", { name: "Gerar PIX" }).click();
  await expect(visitante.getByText(/Copie a chave/)).toBeVisible();
  await expect(visitante.getByText("igreja-campanha@e2e.local")).toBeVisible();
  await expect(visitante.getByRole("button", { name: "Copiar chave PIX" })).toBeVisible();

  // 5. No painel, a doação chega como pendente, com o valor certo.
  await page.goto(campanhaUrl);
  await expect(page.getByText("Visitante Campanha E2E")).toBeVisible();
  await expect(page.getByText(/R\$\s*150,00/)).toBeVisible();

  // 6. Confirmar soma o valor ao total — e o painel também reflete. (O toast
  // de sucesso é transiente e some sozinho; o que importa é o resultado
  // persistido, não pegar o toast no ar.)
  await page.getByRole("button", { name: /Confirmar doação de Visitante Campanha E2E/ }).click();
  await expect(page.getByText(/R\$\s*150,00 de R\$\s*1\.000,00/)).toBeVisible();
  await expect(page.getByText("Confirmada", { exact: true })).toBeVisible();

  // 7. A página pública mostra o progresso atualizado.
  await visitante.goto(campanhaUrl.replace(/\/dashboard\/campaigns\//, `/igreja/${publicCode}/campanhas/`));
  await expect(visitante.getByText(/R\$\s*150,00 de R\$\s*1\.000,00/)).toBeVisible();
});
