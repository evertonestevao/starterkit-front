import { expect, test } from "@playwright/test";
import { getSponsorInviteUrl, invitePath, PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * O caminho opcional do cartão, do começo ao fim: a igreja manda o cadastro,
 * a conta é aprovada (com o provedor `fake`, na hora), a igreja liga o cartão
 * e o botão aparece na página pública.
 *
 * O que este teste protege, mais do que a feature: que a página pública
 * funciona IGUAL sem nada disso. PIX sozinho é um caminho completo, e o
 * cartão é um a mais — se um dia o botão aparecer sem conta aprovada, ou a
 * seção de dízimos sumir por causa desta configuração, o teste quebra.
 */
test("igreja cadastra subconta, liga o cartão e o botão aparece na página", async ({
  page,
  context,
}) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-cartao"),
    password: PASSWORD,
    name: "Pastor Cartao E2E",
    company: "Igreja Cartao E2E",
  });
  const publicCode = invitePath(await getSponsorInviteUrl(page)).split("/").pop()!;

  // A igreja cadastra a chave PIX: é o caminho padrão, e ele basta.
  await page.goto("/dashboard/settings/pix");
  await page.getByLabel("Chave PIX").fill("igreja-cartao@e2e.local");
  await page.getByLabel("Nome do titular").fill("Igreja Cartao E2E");
  await page.getByRole("button", { name: "Revisar alteração" }).click();
  await page.getByRole("button", { name: "Confirmar e salvar" }).click();
  await expect(page.getByText(/Chave PIX salva/)).toBeVisible();

  // Antes de qualquer subconta, a página mostra o PIX e NÃO mostra cartão.
  const visitante = await context.newPage();
  await visitante.goto(`/igreja/${publicCode}`);
  await expect(visitante.getByText("igreja-cartao@e2e.local")).toBeVisible();
  await expect(visitante.getByRole("link", { name: "Doar com cartão" })).toHaveCount(0);

  // O botão de copiar a chave PIX precisa copiar de verdade, não só mudar de
  // legenda. `navigator.clipboard` só existe em HTTPS ou localhost — e esta
  // página é feita para ser aberta via QR Code, ou seja, testada no celular
  // pelo IP da máquina em HTTP puro, onde essa API some.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await visitante.getByRole("button", { name: "Copiar chave PIX" }).click();
  await expect(visitante.getByText("Chave copiada!")).toBeVisible();
  await expect
    .poll(() => visitante.evaluate(() => navigator.clipboard.readText()))
    .toContain("igreja-cartao@e2e.local");

  // Sem a Clipboard API (o cenário real do bug), o botão cai no fallback e
  // ainda assim copia — só a leitura via API muda, a cópia de fato acontece
  // pelo document.execCommand.
  const semClipboard = await context.newPage();
  await semClipboard.addInitScript(() => {
    // @ts-expect-error -- simula um contexto inseguro (HTTP fora de localhost).
    delete window.navigator.__proto__.clipboard;
    Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
  });
  await semClipboard.goto(`/igreja/${publicCode}`);
  await semClipboard.getByRole("button", { name: "Copiar chave PIX" }).click();
  await expect(semClipboard.getByText("Chave copiada!")).toBeVisible();

  // A igreja manda o cadastro da subconta. Com o provedor fake, aprova na hora.
  await page.goto("/dashboard/settings/recebimento");
  await page.getByLabel("Nome da igreja como está no documento").fill("Associacao Igreja Cartao");
  await page.getByLabel("CNPJ ou CPF do responsável").fill("11.222.333/0001-81");
  await page.getByLabel("E-mail da tesouraria").fill("tesouraria@e2e.local");
  await page.getByLabel("Telefone com DDD").fill("14999998888");
  await page.getByLabel("CEP").fill("16400-000");
  await page.getByLabel("Endereço", { exact: true }).fill("Rua das Flores");
  await page.getByLabel("Número").fill("540");
  await page.getByLabel("Bairro").fill("Centro");
  await page.getByLabel("Cidade").fill("Lins");
  await page.getByLabel("UF").fill("SP");
  await page.getByRole("button", { name: "Enviar cadastro" }).click();

  await expect(page.getByText(/Conta aprovada/)).toBeVisible();

  // Aprovada, mas o cartão só entra na página quando a igreja liga.
  await visitante.reload();
  await expect(visitante.getByRole("link", { name: "Doar com cartão" })).toHaveCount(0);

  await page.getByRole("button", { name: "Ligar cartão" }).click();
  await expect(page.getByText(/Cartão ligado/)).toBeVisible();

  await visitante.reload();
  await expect(visitante.getByRole("link", { name: "Doar com cartão" })).toBeVisible();
  // E o PIX continua lá: o cartão não substitui nada.
  await expect(visitante.getByText("igreja-cartao@e2e.local")).toBeVisible();

  // Desligar tira da página na hora.
  await page.getByRole("button", { name: "Desligar cartão" }).click();
  await expect(page.getByText(/Cartão desligado/)).toBeVisible();
  await visitante.reload();
  await expect(visitante.getByRole("link", { name: "Doar com cartão" })).toHaveCount(0);
});
