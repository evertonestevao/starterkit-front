import { defineConfig, devices } from "@playwright/test";

/**
 * E2E dos fluxos críticos (plano §12) contra o Supabase LOCAL.
 * Pré-requisito: npx supabase start (as chaves abaixo são as demo keys
 * públicas e fixas do Supabase CLI — não são segredos).
 */

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Dev server frio (Turbopack compila rota na 1ª visita) estoura os 5s
  // default de expect com specs paralelas — 15s dá folga sem mascarar bug.
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
      NEXT_PUBLIC_BACKEND_PROVIDER: "supabase",
      SUPABASE_SERVICE_ROLE_KEY: LOCAL_SERVICE_ROLE_KEY,
      PAYMENT_GATEWAY: "fake",
      EMAIL_PROVIDER: "console",
      APP_URL: "http://localhost:3000",
    },
  },
});
