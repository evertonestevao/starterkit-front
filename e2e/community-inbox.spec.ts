import { expect, test } from "@playwright/test";
import { getSponsorInviteUrl, invitePath, PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Fluxo crítico: o que a comunidade envia pela página pública tem que chegar
 * ao painel da igreja. Isso ficou quebrado por muito tempo — as tabelas só
 * tinham policy de INSERT, então o dado entrava e ninguém lia.
 */
test("pedido de oração enviado na página pública aparece no painel", async ({ page, context }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-inbox"),
    password: PASSWORD,
    name: "Pastor Inbox E2E",
    company: "Igreja Inbox E2E",
  });
  const publicCode = invitePath(await getSponsorInviteUrl(page)).split("/").pop()!;

  // Visitante anônimo, em outra sessão.
  const visitor = await context.browser()!.newContext();
  const visitorPage = await visitor.newPage();

  // O endereço antigo (/t/) segue chegando na página: QR impresso e link já
  // enviado não podem quebrar por causa da troca para /igreja/.
  await visitorPage.goto(`/t/${publicCode}`);
  await expect(visitorPage).toHaveURL(new RegExp(`/igreja/${publicCode}$`));

  const pedido = `Orem pela minha familia ${Date.now()}`;
  const form = visitorPage.locator("form").first();
  await form.locator('input[name="name"]').fill("Visitante E2E");
  await form.locator('textarea[name="message"], input[name="message"]').first().fill(pedido);
  await form.locator('button[type="submit"]').click();
  // O visitante precisa SABER que chegou — antes a página não dizia nada.
  await expect(visitorPage.getByText("Recebemos o seu pedido")).toBeVisible();
  await visitor.close();

  // O pastor vê o pedido, com o texto exato.
  await page.goto("/dashboard/prayers");
  await expect(page.getByText("Visitante E2E")).toBeVisible();
  await expect(page.getByText(pedido)).toBeVisible();
});

test("igreja não vê pedido enviado para outra igreja", async ({ page, context }) => {
  // Igreja A recebe o pedido.
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-iso-a"),
    password: PASSWORD,
    name: "Pastor Iso A",
    company: "Igreja Iso A E2E",
  });
  const codeA = invitePath(await getSponsorInviteUrl(page)).split("/").pop()!;

  const visitor = await context.browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(`/igreja/${codeA}`);
  const segredo = `Pedido reservado ${Date.now()}`;
  const form = visitorPage.locator("form").first();
  await form.locator('input[name="name"]').fill("Alguem da Igreja A");
  await form.locator('textarea[name="message"], input[name="message"]').first().fill(segredo);
  await form.locator('button[type="submit"]').click();
  // O visitante precisa SABER que chegou — antes a página não dizia nada.
  await expect(visitorPage.getByText("Recebemos o seu pedido")).toBeVisible();
  await visitor.close();

  // Pastor de OUTRA igreja, em sessão limpa, não pode ver nada disso.
  const other = await context.browser()!.newContext();
  const otherPage = await other.newPage();
  await signupAndOnboard(otherPage, {
    email: uniqueEmail("pastor-iso-b"),
    password: PASSWORD,
    name: "Pastor Iso B",
    company: "Igreja Iso B E2E",
  });
  await otherPage.goto("/dashboard/prayers");
  await expect(otherPage.getByText(segredo)).toHaveCount(0);
  await expect(otherPage.getByText("Alguem da Igreja A")).toHaveCount(0);
  await expect(otherPage.getByText("Nenhum pedido ainda")).toBeVisible();
  await other.close();
});
