import { expect, test } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Autopatrocínio: igreja sem nenhum patrocinador pode assumir a própria
 * mensalidade. Cobra no mesmo sistema do patrocínio (valor fixo), nunca
 * aparece como "um patrocinador" na página pública, e a igreja pode fechar
 * a porta pra patrocinador enquanto não tiver nenhum de verdade.
 */
test("igreja sem patrocinador assume a mensalidade, some da lista de patrocinadores e pode fechar a porta", async ({
  page,
}) => {
  const sufixo = Date.now().toString(36);
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-autopatrocinio"),
    password: PASSWORD,
    name: "Pastor Autopatrocínio E2E",
    company: `Igreja Autopatrocínio E2E ${sufixo}`,
  });

  // A mensalidade tem tela própria, com o valor padrão da plataforma.
  await page.goto("/dashboard/mensalidade");
  await expect(page.getByText("R$ 89,90 por mês")).toBeVisible();

  await page.getByRole("button", { name: "Cadastrar pagamento" }).click();
  await page.getByText("Pessoa (CPF)").click();
  await page.getByLabel("Nome do responsável").fill("Pastor E2E");
  await page.getByRole("textbox", { name: "CPF" }).fill("111.444.777-35");
  await page.getByLabel("Email de cobrança").fill(`cobranca-${sufixo}@e2e.local`);
  // Com o provedor de verdade, daqui a pessoa vai para a página do cartão; o de
  // teste não tem essa página e aprova na hora.
  await page.getByRole("button", { name: "Continuar para o cartão" }).click();

  // O toast some sozinho rápido; o que importa é o estado persistido. (O
  // provedor de teste cobra na hora: sai de "aguardando" direto para "em dia".)
  await expect(page.getByText(/Mensalidade de .+: (em dia|aguardando o pagamento)/)).toBeVisible();

  // A antiga tela de assinatura leva à mensalidade.
  await page.goto("/dashboard/billing");
  await expect(page).toHaveURL(/\/dashboard\/mensalidade$/);

  // A porta do patrocinador continua em Patrocinadores.
  await page.goto("/dashboard/sponsors");
  await expect(page.getByText("está sem patrocinador")).toBeVisible();

  // O autopatrocínio nunca aparece como um patrocinador de verdade.
  const link = page.getByText(/\/patrocinador\/patrocinar\//);
  const publicPath = (await link.textContent())?.replace(/^https?:\/\/[^/]+/, "").trim() ?? "";
  const publicCode = publicPath.split("/").pop() ?? "";

  const lp = await page.context().newPage();
  await lp.goto(`/igreja/${publicCode}`);
  await expect(lp.getByText("Quem apoia esta página")).toBeVisible();
  await expect(lp.getByText("Pastor E2E")).toHaveCount(0);

  // Fecha a porta: o espaço some da LP por inteiro.
  await page.getByRole("button", { name: "Fechar a porta pra patrocinador" }).click();
  await expect(page.getByRole("button", { name: "Voltar a aceitar patrocinador" })).toBeVisible();
  await lp.reload();
  await expect(lp.getByText("Quem apoia esta página")).toBeHidden();

  // Reabre: continua pagando, e o espaço volta. Espera o dashboard confirmar
  // a troca antes de recarregar a LP, senão a leitura corre antes da escrita.
  await page.getByRole("button", { name: "Voltar a aceitar patrocinador" }).click();
  await expect(page.getByRole("button", { name: "Fechar a porta pra patrocinador" })).toBeVisible();
  await lp.reload();
  await expect(lp.getByText("Quem apoia esta página")).toBeVisible();
});

/**
 * Pix Automático, com o provedor de teste (o único que o implementa por
 * enquanto): a igreja escolhe a forma, vê o QR Code, e a tela muda para "em
 * dia" quando o provedor avisa que o pagamento caiu. O provedor de teste não
 * paga sozinho — o aviso é mandado aqui, como o provedor de verdade faria.
 */
test("igreja paga a mensalidade por Pix Automático: QR Code, aguardando e em dia", async ({ page, request }) => {
  const sufixo = Date.now().toString(36);
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-pix-automatico"),
    password: PASSWORD,
    name: "Pastor Pix E2E",
    company: `Igreja Pix Automático E2E ${sufixo}`,
  });

  await page.goto("/dashboard/mensalidade");
  await page.getByRole("button", { name: "Cadastrar pagamento" }).click();
  await page.getByText("Pix Automático", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Gerar QR Code do Pix" })).toBeVisible();
  await page.waitForTimeout(400); // a troca de cor da opção marcada é animada
  await page.screenshot({ path: "prints-ebd/mensalidade-formas.png" });
  await page.getByText("Pessoa (CPF)").click();
  await page.getByLabel("Nome do responsável").fill("Pastor Pix E2E");
  await page.getByRole("textbox", { name: "CPF" }).fill("111.444.777-35");
  await page.getByLabel("Email de cobrança").fill(`cobranca-pix-${sufixo}@e2e.local`);
  await page.getByRole("button", { name: "Gerar QR Code do Pix" }).click();

  // O QR Code e o "copia e cola" aparecem na própria tela.
  await expect(page.getByAltText("QR Code para autorizar o Pix Automático")).toBeVisible();
  const copiaECola = (await page.getByLabel("Pix copia e cola").textContent()) ?? "";
  expect(copiaECola).toMatch(/^FAKEPIX\|/);
  await page.screenshot({ path: "prints-ebd/mensalidade-pix-qrcode.png" });

  // Fechou a tela sem pagar: fica "aguardando", e dá para gerar outro QR Code.
  await page.reload();
  await expect(page.getByText(/aguardando o pagamento/)).toBeVisible();
  await expect(page.getByText(/por Pix Automático/)).toBeVisible();
  await page.getByRole("button", { name: "Gerar QR Code do Pix" }).click();
  await expect(page.getByAltText("QR Code para autorizar o Pix Automático")).toBeVisible();
  const novo = (await page.getByLabel("Pix copia e cola").textContent()) ?? "";
  expect(novo).not.toBe(copiaECola);

  // O provedor avisa que a cobrança foi paga (no fake, o copia e cola carrega a assinatura).
  const [, subscriptionId, amountCents, dueDate] = novo.split("|");
  const aviso = await request.post("/api/webhooks/sponsor-billing/fake", {
    headers: { "x-fake-billing-token": "fake-billing-token", "content-type": "application/json" },
    data: {
      kind: "charge",
      provider: "fake",
      charge: {
        paymentId: `fake_pay_e2e_${sufixo}`,
        subscriptionId,
        amountCents: Number(amountCents),
        dueDate,
        status: "paid",
        paidAt: new Date().toISOString(),
        invoiceUrl: null,
      },
    },
  });
  expect(aviso.ok()).toBe(true);

  await page.getByRole("button", { name: "Já autorizei" }).click();
  await expect(page.getByText(/Mensalidade de .+: em dia/)).toBeVisible();
  await expect(page.getByText(/por Pix Automático/)).toBeVisible();
  await page.screenshot({ path: "prints-ebd/mensalidade-pix-em-dia.png" });
});
