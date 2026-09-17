import { defineConfig, devices } from "@playwright/test";

/**
 * E2E dos fluxos críticos (plano §12).
 *
 * O Supabase usado é o do `.env.local` — o Next carrega esse arquivo
 * sozinho. Antes a URL e as chaves eram injetadas aqui, fixas em 127.0.0.1,
 * e a suíte inteira quebrou quando o banco saiu da máquina. Pior: o Next NÃO
 * sobrescreve variável já presente no processo, então o valor injetado vencia
 * o `.env.local` silenciosamente.
 *
 * O bloco `env` abaixo carrega só o que o teste PRECISA forçar — provedores
 * falsos, para nenhuma execução cobrar cartão nem enviar email de verdade.
 *
 * Roda contra BUILD DE PRODUÇÃO, não contra `next dev`, por dois motivos:
 * o Turbopack compila cada rota na primeira visita (o `POST /signup` levava
 * 16s no começo da suíte e 363ms no fim — falha intermitente que não é bug do
 * produto), e é o build de produção que vai para o ar. Porta 3100 para não
 * disputar o `npm run dev` que costuma estar aberto na 3000.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    // Nunca reaproveitar servidor alheio: o da 3100 só existe se for este.
    reuseExistingServer: false,
    // O build entra no tempo: 3 min cobre uma máquina fria.
    timeout: 180_000,
    stdout: "pipe",
    env: {
      PAYMENT_GATEWAY: "fake",
      SPONSOR_BILLING_PROVIDER: "fake",
      EMAIL_PROVIDER: "console",
      RATE_LIMIT_STORE: "memory",
      APP_URL: BASE_URL,
    },
  },
});
