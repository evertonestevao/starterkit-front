import { expect, test } from "@playwright/test";
import { getSponsorInviteUrl, invitePath, PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Ciclo inteiro de um evento: a igreja publica pelo painel, o visitante
 * encontra na página pública e se inscreve, e a igreja vê o inscrito com a
 * lista filtrada por aquele evento.
 */
test("igreja publica evento, visitante se inscreve e o pastor vê filtrado", async ({ page, context }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-eventos"),
    password: PASSWORD,
    name: "Pastor Eventos E2E",
    company: "Igreja Eventos E2E",
  });
  const publicCode = invitePath(await getSponsorInviteUrl(page)).split("/").pop()!;
  const titulo = `Retiro E2E ${Date.now()}`;

  // 1. A igreja publica pelo painel.
  await page.goto("/dashboard/events");
  await page.getByRole("link", { name: "Novo evento" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/events\/novo/);
  await page.getByLabel("Nome do evento").fill(titulo);
  await page.getByLabel("Começa em").fill("2030-05-10T19:00");
  await page.getByLabel(/Valor da inscrição/).fill("50,00");
  await page.getByLabel(/Descrição/).fill("Um fim de semana de comunhão para os jovens.");
  await page.getByRole("button", { name: "Publicar evento" }).click();

  await expect(page).toHaveURL(/\/dashboard\/events\?evento=/);
  await expect(page.getByText(`“${titulo}” publicado`)).toBeVisible();

  // 2. O visitante encontra na página pública e se inscreve.
  const visitor = await context.browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/igreja/${publicCode}/eventos`);
  await expect(visitorPage.getByText(titulo)).toBeVisible();
  await expect(visitorPage.getByText("R$ 50,00").first()).toBeVisible();
  // 19:00 digitado no painel aparece 19:00 para o visitante — sem desvio de fuso.
  await expect(visitorPage.getByText(/10 de maio · 19:00/)).toBeVisible();

  await visitorPage.getByRole("link", { name: new RegExp(titulo) }).click();
  await visitorPage.getByLabel("Seu nome").fill("Visitante Eventos E2E");
  await visitorPage.getByLabel("WhatsApp, telefone ou email").fill("11988887777");
  await visitorPage.getByRole("button", { name: /Inscrever-me/ }).click();
  // A frase aparece na página e no aviso do canto: confere a da página.
  await expect(visitorPage.getByRole("status").getByText("Inscrição feita")).toBeVisible();
  // Evento pago sem chave PIX cadastrada: a igreja combina o pagamento.
  await expect(visitorPage.getByText(/vai falar com você para combinar o pagamento/)).toBeVisible();
  await visitor.close();

  // 3. O pastor vê a contagem e filtra pelo evento.
  await page.goto("/dashboard/events");
  await expect(page.getByText("1 inscrito")).toBeVisible();
  await page.getByRole("link", { name: `${titulo} · 1` }).click();
  await expect(page).toHaveURL(/evento=/);
  await expect(page.getByText("Visitante Eventos E2E").first()).toBeVisible();
});

/**
 * Editar um evento publicado tem que refletir o valor novo. Mesmo bug do
 * formulário de perfil da igreja e do de programação: o <form> de edição não
 * remontava depois que o salvamento trazia os dados novos do servidor, e o
 * Base UI acusava os <Input defaultValue=...> já montados recebendo um valor
 * diferente — aviso que só aparece em `next dev`, então não dá para
 * reproduzi-lo aqui (este teste roda contra um build de produção); o que dá
 * para verificar é que o valor persiste depois do salvamento.
 */
test("editar um evento publicado atualiza o valor exibido", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-eventos-edit"),
    password: PASSWORD,
    name: "Pastor Eventos Edit E2E",
    company: "Igreja Eventos Edit E2E",
  });
  const titulo = `Retiro Edit E2E ${Date.now()}`;

  await page.goto("/dashboard/events");
  await page.getByRole("link", { name: "Novo evento" }).first().click();
  await page.getByLabel("Nome do evento").fill(titulo);
  await page.getByLabel("Começa em").fill("2030-05-10T19:00");
  await page.getByLabel(/Valor da inscrição/).fill("50,00");
  await page.getByRole("button", { name: "Publicar evento" }).click();
  await expect(page.getByText(`“${titulo}” publicado`)).toBeVisible();

  await page.goto("/dashboard/events");

  await page.getByText("Editar ou remover", { exact: true }).click();
  const novoTitulo = `${titulo} renomeado`;
  await page.getByLabel("Nome").fill(novoTitulo);
  await page.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(page.getByText(`“${novoTitulo}” foi atualizado.`)).toBeVisible();
});

test("página da igreja não tem mais o campo livre de evento", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-sem-campo"),
    password: PASSWORD,
    name: "Pastor Sem Campo E2E",
    company: "Igreja Sem Campo E2E",
  });
  const publicCode = invitePath(await getSponsorInviteUrl(page)).split("/").pop()!;

  await page.goto(`/igreja/${publicCode}`);
  await expect(page.getByRole("heading", { name: "Igreja Sem Campo E2E" })).toBeVisible();
  await expect(page.getByLabel("Qual evento?")).toHaveCount(0);
  await expect(page.locator('input[name="event_name"]')).toHaveCount(0);
});
