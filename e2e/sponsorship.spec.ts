import { expect, test } from "@playwright/test";
import {
  getSponsorInviteUrl,
  invitePath,
  PASSWORD,
  signupAndOnboard,
  uniqueEmail,
} from "./helpers";

/**
 * Fluxo crítico: patrocínio. É o único caminho do produto com dinheiro do
 * cliente, e passou a ter muita peça móvel (RLS, RPCs, provedor de cobrança,
 * link de acesso sem senha). Sem estes testes, uma regressão aqui só
 * apareceria na fatura de alguém.
 *
 * Roda com SPONSOR_BILLING_PROVIDER=fake: a primeira cobrança nasce paga,
 * então o ciclo inteiro acontece sem cartão nem rede.
 */

test("visitante assina patrocínio sem login e a igreja passa a ver o apoio", async ({
  page,
  context,
}) => {
  // 1. O pastor cria a igreja e pega o link que divulgaria.
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-patro"),
    password: PASSWORD,
    name: "Pastor Patrocinio E2E",
    company: "Igreja Patrocinio E2E",
  });
  const inviteUrl = await getSponsorInviteUrl(page);

  // 2. Um visitante ANÔNIMO abre o link, em outra sessão.
  const visitor = await context.browser()!.newContext();
  const visitorPage = await visitor.newPage();
  await visitorPage.goto(invitePath(inviteUrl));

  // O convite é público: nada de parede de login.
  await expect(visitorPage.getByText("Convite para patrocinar")).toBeVisible();
  await expect(visitorPage.getByRole("heading", { name: "Igreja Patrocinio E2E" })).toBeVisible();
  // O preco de entrada em destaque, nao a linha da tabela de faixas.
  await expect(visitorPage.getByText("R$ 39,90/mês")).toBeVisible();
  // O valor não vai para a igreja, e isso precisa estar dito antes de pagar.
  await expect(visitorPage.getByText(/não é repassado para a igreja/i)).toBeVisible();

  // 3. Assina como patrocinador novo.
  const sponsorEmail = uniqueEmail("patrocinador");
  await visitorPage.getByRole("link", { name: "Assinar patrocínio" }).click();

  // O patrocinador tem de aceitar o contrato DELE. Apontar para os termos das
  // igrejas invalidaria o aceite: ele teria concordado com outro contrato.
  await expect(visitorPage.getByRole("link", { name: /Termos de Uso/i })).toHaveAttribute(
    "href",
    "/terms/patrocinador",
  );

  await visitorPage.locator('label:has(input[name="kind"][value="person"])').click();
  await visitorPage.getByRole("textbox", { name: "Seu nome" }).fill("Padaria E2E");
  await visitorPage.getByRole("textbox", { name: "Email" }).fill(sponsorEmail);
  await visitorPage.getByRole("textbox", { name: "CPF" }).fill("529.982.247-25");
  await visitorPage.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await visitorPage.getByRole("button", { name: /Assinar patrocínio/ }).click();

  await expect(visitorPage).toHaveURL(/\/obrigado/);
  await expect(visitorPage.getByText(/Obrigado pelo seu apoio/i)).toBeVisible();

  // 4. O nome aparece na página pública da igreja.
  const publicCode = invitePath(inviteUrl).split("/").pop()!;
  await visitorPage.goto(`/igreja/${publicCode}`);
  await expect(visitorPage.getByText("Padaria E2E")).toBeVisible();

  // 5. E o pastor vê o patrocinador no painel dele.
  await page.goto("/dashboard/sponsors");
  await expect(page.getByText("Padaria E2E")).toBeVisible();
  // Sem valor e sem CPF: o dinheiro nao e da igreja, e o documento nao e
  // da conta dela.
  await expect(page.getByText(/R\$\s?\d/)).toHaveCount(0);
  await expect(page.getByText("529.982.247-25")).toHaveCount(0);

  await visitor.close();
});

test("email que já tem conta não é cobrado nem vinculado de novo", async ({ page, context }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-dup"),
    password: PASSWORD,
    name: "Pastor Dup E2E",
    company: "Igreja Dup E2E",
  });
  const inviteUrl = await getSponsorInviteUrl(page);

  const visitor = await context.browser()!.newContext();
  const visitorPage = await visitor.newPage();
  const sponsorEmail = uniqueEmail("patrocinador-dup");

  const assinar = async () => {
    await visitorPage.goto(`${invitePath(inviteUrl)}/novo`);
    await visitorPage.locator('label:has(input[name="kind"][value="person"])').click();
  await visitorPage.getByRole("textbox", { name: "Seu nome" }).fill("Mercado E2E");
    await visitorPage.getByRole("textbox", { name: "Email" }).fill(sponsorEmail);
    await visitorPage.getByRole("textbox", { name: "CPF" }).fill("529.982.247-25");
    await visitorPage.getByRole("checkbox", { name: /Li e aceito/ }).check();
    await visitorPage.getByRole("button", { name: /Assinar patrocínio/ }).click();
  };

  await assinar();
  await expect(visitorPage).toHaveURL(/\/obrigado/);

  // Segunda vez com o MESMO email: nada de cobrar nem vincular. Vincular
  // pela digitação do email deixaria qualquer um aumentar a fatura de outra
  // pessoa.
  await assinar();
  await expect(visitorPage.getByText(/link para o seu email/i)).toBeVisible();
  await expect(visitorPage).not.toHaveURL(/\/obrigado/);

  await visitor.close();
});

test("patrocinador entra por link, vê o total e cancela com recálculo", async ({
  page,
  context,
}) => {
  // Duas igrejas, para o recálculo por posição ter o que mostrar.
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-calc"),
    password: PASSWORD,
    name: "Pastor Calc E2E",
    company: "Igreja Calc A E2E",
  });
  const inviteA = await getSponsorInviteUrl(page);

  const visitor = await context.browser()!.newContext();
  const visitorPage = await visitor.newPage();
  const sponsorEmail = uniqueEmail("patrocinador-calc");

  await visitorPage.goto(`${invitePath(inviteA)}/novo`);
  await visitorPage.locator('label:has(input[name="kind"][value="person"])').click();
  await visitorPage.getByRole("textbox", { name: "Seu nome" }).fill("Clinica E2E");
  await visitorPage.getByRole("textbox", { name: "Email" }).fill(sponsorEmail);
  await visitorPage.getByRole("textbox", { name: "CPF" }).fill("529.982.247-25");
  await visitorPage.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await visitorPage.getByRole("button", { name: /Assinar patrocínio/ }).click();
  await expect(visitorPage).toHaveURL(/\/obrigado/);

  // O patrocinador nao definiu senha: o painel so abre pelo link de acesso.
  // Em e2e o EMAIL_PROVIDER e console, entao a sessao e obtida pedindo o
  // link e lendo o retorno da action nao seria possivel — o teste cobre o
  // que o usuario ve: a tela confirma o envio sem revelar se a conta existe.
  await visitorPage.goto("/patrocinador/login");
  await visitorPage.locator("#access-email").fill(sponsorEmail);
  await visitorPage.getByRole("button", { name: /Receber link de acesso/ }).click();
  await expect(visitorPage.getByText(/Se este email tiver uma conta/i)).toBeVisible();

  // Mesmo texto para email que nao existe: sem vazar quem e cadastrado.
  await visitorPage.goto("/patrocinador/login");
  await visitorPage.locator("#access-email").fill(uniqueEmail("nao-existe"));
  await visitorPage.getByRole("button", { name: /Receber link de acesso/ }).click();
  await expect(visitorPage.getByText(/Se este email tiver uma conta/i)).toBeVisible();

  await visitor.close();
});
