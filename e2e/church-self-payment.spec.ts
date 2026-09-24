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

  await page.goto("/dashboard/sponsors");
  await expect(page.getByText("está sem patrocinador")).toBeVisible();

  await page.getByRole("button", { name: "Assumir a mensalidade" }).click();
  await page.getByLabel("Nome do responsável").fill("Pastor E2E");
  await page.getByRole("textbox", { name: "CPF" }).fill("111.444.777-35");
  await page.getByLabel("Email de cobrança").fill(`cobranca-${sufixo}@e2e.local`);
  await page.getByRole("button", { name: "Assumir a mensalidade" }).click();

  // O toast some sozinho rápido; o que importa é o estado persistido.
  await expect(page.getByText("Você está pagando a mensalidade")).toBeVisible();

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
