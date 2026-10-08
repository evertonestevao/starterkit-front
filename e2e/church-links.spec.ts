import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, signupAndOnboard, uniqueEmail } from "./helpers";

/**
 * Vínculo entre igrejas: a igreja SUPERIOR gera um link e o manda aos pastores
 * de baixo. O link não liga nada: quem o abre decide se quer, pede o vínculo,
 * e a superior aprova (podendo ajustar a posição) ou recusa. Só a aprovação
 * muda a árvore. Depois, a superior pode mover a igreja de posição, e qualquer
 * das duas pontas pode desfazer o vínculo.
 */
test("link da superior: não quero, recusa, aprovação com posição ajustada, mudança de posição, nome herdado e saída", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const sufixo = Date.now().toString(36);
  const nomeSede = `Sede Vinculo ${sufixo}`;
  const nomeFilha = `Filha Vinculo ${sufixo}`;

  const contextoSede = await browser.newContext();
  const contextoFilha = await browser.newContext();
  const sede = await contextoSede.newPage();
  const filha = await contextoFilha.newPage();

  await signupAndOnboard(sede, {
    email: uniqueEmail("pastor-sede-vinculo"),
    password: PASSWORD,
    name: "Pastor Sede Vinculo",
    company: nomeSede,
  });
  await signupAndOnboard(filha, {
    email: uniqueEmail("pastor-filha-vinculo"),
    password: PASSWORD,
    name: "Pastor Filha Vinculo",
    company: nomeFilha,
  });

  const avisosSede = () => sede.getByRole("list", { name: "Avisos sobre vínculos entre igrejas" });
  const avisosFilha = () => filha.getByRole("list", { name: "Avisos sobre vínculos entre igrejas" });

  // ---- 1. A sede gera UM link, para subsedes ----
  await sede.goto("/dashboard/settings/vinculos");
  // O formulário de convite fica recolhido por padrão.
  await sede.getByRole("button", { name: "Convidar igreja" }).click();
  // Validade e limite não têm padrão: o botão só liga depois das escolhas.
  await expect(sede.getByRole("button", { name: "Gerar link" })).toBeDisabled();
  await sede.locator("label", { hasText: "Subsede" }).first().click();
  await sede.locator("label", { hasText: /^15 dias$/ }).click();
  await sede.getByLabel("Número máximo de pedidos").fill("5");
  await sede.getByRole("button", { name: "Gerar link" }).click();
  await expect(sede.getByText(/0 de 5 pedidos · vale até \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
  const linha = sede.locator("p", { hasText: "/vinculo/" }).first();
  await expect(linha).toBeVisible();
  const url = ((await linha.textContent()) ?? "").trim();
  expect(url).toMatch(/\/vinculo\/[\w-]{20,}$/);
  const caminho = new URL(url).pathname;

  // ---- 2. A filha abre, lê como funciona e diz "Não quero": nada acontece e ninguém é avisado ----
  await filha.goto(caminho);
  await expect(filha.getByText(/convida a sua igreja para fazer parte da rede dela/)).toBeVisible();
  await expect(filha.getByText(/Nada muda até a igreja que enviou o link aprovar/)).toBeVisible();
  await expect(filha.getByText(/contagem de pedidos de oração/)).toBeVisible();
  await filha.getByRole("link", { name: "Não quero" }).click();
  await expect(filha).toHaveURL(/\/dashboard$/);

  await sede.goto("/dashboard");
  await expect(avisosSede()).toBeHidden();
  await sede.goto("/dashboard/settings/vinculos");
  await expect(sede.getByText(/Pedidos aguardando a sua resposta/)).toBeHidden();

  // ---- 3. A filha PEDE o vínculo: a árvore não muda, e o estado fica claro ----
  await filha.goto(caminho);
  await filha.getByRole("button", { name: "Quero solicitar o vínculo" }).click();
  await expect(filha.getByText(new RegExp(`Aguardando a aprovação de ${nomeSede}`))).toBeVisible();
  await expect(filha.getByRole("button", { name: "Quero solicitar o vínculo" })).toBeHidden();
  await filha.goto("/dashboard/settings/vinculos");
  await expect(filha.getByText(/ainda não está ligada a nenhuma outra/)).toBeVisible();

  // ---- 4. A sede é avisada do pedido e RECUSA, com motivo opcional ----
  await sede.goto("/dashboard");
  await expect(avisosSede().getByText(/pediu para entrar na sua rede/)).toBeVisible();
  await avisosSede().getByRole("link", { name: "Ver o pedido" }).click();
  await expect(sede.getByText("Pedidos aguardando a sua resposta (1)")).toBeVisible();
  await expect(sede.getByText(nomeFilha).first()).toBeVisible();
  await sede.getByRole("button", { name: "Recusar" }).click();
  await sede.getByLabel("Motivo (opcional)").fill("Ainda não conhecemos esta igreja.");
  await sede.getByRole("button", { name: "Confirmar recusa" }).click();
  await expect(sede.getByText("Pedido recusado. A igreja foi avisada.").first()).toBeVisible();

  await filha.goto("/dashboard");
  await expect(avisosFilha().getByText(/não aprovou o seu pedido de vínculo/)).toBeVisible();
  await expect(avisosFilha().getByText("Motivo: Ainda não conhecemos esta igreja.")).toBeVisible();
  await avisosFilha().getByRole("button", { name: "Dispensar aviso" }).click();
  await expect(avisosFilha()).toBeHidden();

  // ---- 5. O MESMO link ainda vale: a filha pede de novo, e a sede aprova AJUSTANDO a posição ----
  await filha.goto(caminho);
  await expect(filha.getByText(/Seu pedido anterior não foi aprovado/)).toBeVisible();
  await filha.getByRole("button", { name: "Quero solicitar o vínculo" }).click();
  await expect(filha.getByText(new RegExp(`Aguardando a aprovação de ${nomeSede}`))).toBeVisible();

  await sede.goto("/dashboard/settings/vinculos");
  await expect(sede.getByText("Pedidos aguardando a sua resposta (1)")).toBeVisible();
  await sede.getByLabel("Aprovar como").selectOption("congregacao");
  await sede.getByRole("button", { name: "Aprovar", exact: true }).click();
  await expect(sede.getByText("Vínculo aprovado. A igreja entrou na sua rede e foi avisada.").first()).toBeVisible();
  // A rede é uma lista de linhas: a igreja aparece recolhida, e as ações ficam no painel dela.
  const linhaFilha = sede.getByRole("button", { name: new RegExp(nomeFilha) });
  await expect(linhaFilha).toBeVisible();
  await expect(linhaFilha).toHaveAttribute("aria-expanded", "false");
  await expect(sede.getByText("Igrejas ligadas (1)")).toBeVisible();
  await linhaFilha.click();
  await expect(sede.getByRole("button", { name: "Desfazer vínculo" })).toBeVisible();

  await filha.goto("/dashboard");
  await expect(avisosFilha().getByText(/aprovou o vínculo da sua igreja/)).toBeVisible();
  await expect(avisosFilha().getByText(new RegExp(`Agora é congregação de ${nomeSede}`))).toBeVisible();
  await avisosFilha().getByRole("button", { name: "Dispensar aviso" }).click();
  await filha.goto("/dashboard/settings/vinculos");
  await expect(filha.getByText(nomeSede, { exact: false }).first()).toBeVisible();
  await expect(filha.getByRole("button", { name: "Sair do vínculo" })).toBeVisible();

  // ---- 6. A sede MUDA a posição da igreja (congregação -> subsede) e ela é avisada ----
  await sede.goto("/dashboard/settings/vinculos");
  await sede.getByRole("button", { name: new RegExp(nomeFilha) }).click();
  await sede.getByRole("button", { name: "Mudar função" }).click();
  await sede.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(sede.getByText("Função alterada. A igreja foi avisada.").first()).toBeVisible();
  // Virou subsede: a linha mostra quantas congregações ela tem (ainda nenhuma).
  await expect(sede.getByRole("button", { name: new RegExp(`${nomeFilha}.*Sem congregações`) })).toBeVisible();

  await filha.goto("/dashboard");
  await expect(avisosFilha().getByText(/mudou a função da sua igreja na rede/)).toBeVisible();
  await expect(avisosFilha().getByText(new RegExp(`Agora é subsede de ${nomeSede}`))).toBeVisible();
  await avisosFilha().getByRole("button", { name: "Dispensar aviso" }).click();

  // ---- 7. A filha herda o nome da sede; o sobrenome é só dela ----
  await filha.goto("/dashboard/settings/igreja");
  const publica = await filha.getByRole("link", { name: /Ver a página/ }).getAttribute("href");
  expect(publica).toBeTruthy();

  await filha.goto("/dashboard/settings");
  await filha.getByRole("checkbox", { name: /Usar o nome de/ }).check();
  await expect(filha.locator("#name")).toBeDisabled();
  await expect(filha.locator("#name")).toHaveValue(nomeSede);
  await filha.locator("#sobrenome").fill("Prainha - Promissão");
  await filha.getByRole("button", { name: "Salvar dados" }).click();
  await expect(filha.getByText("Dados da igreja atualizados.").first()).toBeVisible();

  await filha.goto(publica!);
  await expect(filha.getByRole("heading", { level: 1, name: nomeSede })).toBeVisible();
  await expect(filha.getByText("Prainha - Promissão", { exact: true })).toBeVisible();

  const novoNome = `Sede Renomeada ${sufixo}`;
  await sede.goto("/dashboard/settings");
  await sede.locator("#name").fill(novoNome);
  await sede.getByRole("button", { name: "Salvar dados" }).click();
  await expect(sede.getByText("Dados da igreja atualizados.").first()).toBeVisible();
  await filha.goto(publica!);
  await expect(filha.getByRole("heading", { level: 1, name: novoNome })).toBeVisible();

  // ---- 8. A filha sai do vínculo: volta ao nome próprio e a sede é avisada ----
  await filha.goto("/dashboard/settings/vinculos");
  await filha.getByRole("button", { name: "Sair do vínculo" }).click();
  await filha.getByRole("button", { name: "Sim, desfazer" }).click();
  await expect(filha.getByText("Vínculo desfeito. A outra igreja foi avisada.").first()).toBeVisible();

  await filha.goto(publica!);
  await expect(filha.getByRole("heading", { level: 1, name: nomeFilha })).toBeVisible();
  await expect(filha.getByText("Prainha - Promissão", { exact: true })).toBeVisible();

  await sede.goto("/dashboard");
  await expect(avisosSede().getByText(/desfez o vínculo com a sua igreja/)).toBeVisible();

  // ---- 9. A sede CANCELA o link: quem ainda não usou não consegue mais ----
  await sede.goto("/dashboard/settings/vinculos");
  await sede.getByRole("button", { name: "Cancelar link" }).click();
  await expect(sede.getByText("Link cancelado. Quem ainda não usou não consegue mais.").first()).toBeVisible();
  await filha.goto(caminho);
  await expect(filha.getByText("Quem enviou cancelou este link. Peça um novo.")).toBeVisible();
  await expect(filha.getByRole("button", { name: "Quero solicitar o vínculo" })).toBeHidden();

  await contextoSede.close();
  await contextoFilha.close();
});

/**
 * Quem ainda não tem conta cria a conta e a igreja pelo próprio link e volta a
 * ele para pedir o vínculo. O pedido continua pendente até a superior aprovar.
 */
test("quem não tem conta cria a conta pelo link e o pedido fica pendente para a superior", async ({ browser }) => {
  test.setTimeout(240_000);
  const sufixo = Date.now().toString(36);
  const nomeSede = `Sede Convite ${sufixo}`;
  const nomeNova = `Igreja Nova ${sufixo}`;

  const contextoSede = await browser.newContext();
  const sede = await contextoSede.newPage();
  await signupAndOnboard(sede, {
    email: uniqueEmail("pastor-sede-convite"),
    password: PASSWORD,
    name: "Pastor Sede Convite",
    company: nomeSede,
  });
  await sede.goto("/dashboard/settings/vinculos");
  await sede.getByRole("button", { name: "Convidar igreja" }).click();
  // Link sem validade e sem limite: fica aberto até ser cancelado, e a tela avisa.
  await sede.locator("label", { hasText: "Sem validade" }).click();
  await sede.locator("label", { hasText: "Sem limite" }).click();
  await expect(sede.getByText(/continua aberto até você cancelá-lo/)).toBeVisible();
  await sede.getByRole("button", { name: "Gerar link" }).click();
  await expect(sede.getByText(/0 pedidos \(sem limite\) · sem validade/)).toBeVisible();
  const linha = sede.locator("p", { hasText: "/vinculo/" }).first();
  await expect(linha).toBeVisible();
  const caminho = new URL(((await linha.textContent()) ?? "").trim()).pathname;

  const contextoNovo = await browser.newContext();
  const nova: Page = await contextoNovo.newPage();

  // Sem sessão: o link leva ao login, que guarda o destino, e daí ao cadastro.
  await nova.goto(caminho);
  await expect(nova).toHaveURL(/\/login\?next=/);
  await nova.getByRole("link", { name: "Criar conta" }).click();
  await nova.getByLabel("Nome completo").fill("Pastor Igreja Nova");
  await nova.getByLabel("Email").fill(uniqueEmail("pastor-igreja-nova"));
  await nova.getByLabel("Senha").fill(PASSWORD);
  await nova.getByRole("button", { name: "Criar conta" }).click();

  // Cadastrada a conta, o link avisa que falta a igreja e leva ao cadastro dela.
  await expect(nova).toHaveURL(new RegExp(caminho));
  await nova.getByRole("link", { name: "Cadastrar minha igreja" }).click();
  await expect(nova).toHaveURL(/\/onboarding\?next=/);
  await nova.getByLabel("Nome da igreja").fill(nomeNova);
  await nova.getByRole("checkbox", { name: /Li e aceito/ }).check();
  await nova.getByRole("button", { name: "Criar igreja" }).click();

  // Depois de criar a igreja, volta ao link e pede o vínculo.
  await expect(nova).toHaveURL(new RegExp(caminho));
  await expect(nova.getByText(/convida a sua igreja para fazer parte da rede dela/)).toBeVisible();
  await nova.getByRole("button", { name: "Quero solicitar o vínculo" }).click();
  await expect(nova.getByText(new RegExp(`Aguardando a aprovação de ${nomeSede}`))).toBeVisible();

  // A igreja nova segue independente até a superior aprovar.
  await nova.goto("/dashboard/settings/vinculos");
  await expect(nova.getByText(/ainda não está ligada a nenhuma outra/)).toBeVisible();

  await sede.goto("/dashboard/settings/vinculos");
  await expect(sede.getByText("Pedidos aguardando a sua resposta (1)")).toBeVisible();
  await expect(sede.getByText(nomeNova).first()).toBeVisible();

  await contextoSede.close();
  await contextoNovo.close();
});

/** Link inventado não existe, e o retorno do cadastro só aceita caminho de link. */
test("link inventado não existe e o retorno do onboarding não é um redirecionamento aberto", async ({ page }) => {
  await signupAndOnboard(page, {
    email: uniqueEmail("pastor-link-invalido"),
    password: PASSWORD,
    name: "Pastor Link Invalido",
    company: `Igreja Link Invalido ${Date.now().toString(36)}`,
  });

  await page.goto("/vinculo/token-que-nao-existe-em-lugar-nenhum-123456");
  await expect(page.getByText("Link não encontrado")).toBeVisible();

  // Quem já tem igreja não fica preso no onboarding, e um destino de fora é ignorado.
  await page.goto("/onboarding?next=https://malicioso.example/");
  await expect(page).toHaveURL(/\/dashboard$/);
});
