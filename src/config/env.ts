import { z } from "zod";

/**
 * Validação das variáveis de ambiente com Zod, separadas por onde rodam.
 * Falha cedo (no boot) em vez de quebrar em runtime no meio de uma request.
 */

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_BACKEND_PROVIDER: z.enum(["supabase", "api"]).default("supabase"),
});

/**
 * Vars que só existem no servidor. Todas opcionais no schema porque nem todo
 * ambiente (ex.: CI rodando testes unitários) as define — cada consumidor
 * exige a sua via `requireServerEnv`.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PAYMENT_GATEWAY: z.enum(["stripe", "fake"]).default("fake"),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Price IDs criados no painel/CLI do Stripe (modo test ou live). */
  STRIPE_PRICE_PRO: z.string().min(1).optional(),
  STRIPE_PRICE_ENTERPRISE: z.string().min(1).optional(),
  STRIPE_PRICE_EXTRA_SEAT: z.string().min(1).optional(),
  EMAIL_PROVIDER: z.enum(["resend", "console"]).default("console"),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.email().optional(),
  /** URL pública da app, usada em links de emails transacionais. */
  APP_URL: z.url().default("http://localhost:3000"),
  /** Notificações externas (WhatsApp/SMS/push). Só "console" implementado. */
  NOTIFICATION_PROVIDER: z.enum(["console"]).default("console"),
  /** Store do rate limiter: memory (single-node/dev) ou redis (Upstash). */
  RATE_LIMIT_STORE: z.enum(["memory", "redis"]).default("memory"),
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  /** Monitoramento de erros: console (só log) ou sentry (exige SENTRY_DSN). */
  ERROR_REPORTER: z.enum(["console", "sentry"]).default("console"),
  SENTRY_DSN: z.url().optional(),
  /** Nome do ambiente nos relatórios de erro (production, staging...). */
  APP_ENV: z.string().min(1).default("development"),
});

export function getClientEnv() {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_BACKEND_PROVIDER: process.env.NEXT_PUBLIC_BACKEND_PROVIDER,
  });
}

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() não pode ser chamado no client");
  }
  return serverEnvSchema.parse(process.env);
}

/** Exige uma var de servidor específica, com erro claro se ausente. */
export function requireServerEnv<K extends keyof ReturnType<typeof getServerEnv>>(
  key: K,
): NonNullable<ReturnType<typeof getServerEnv>[K]> {
  const value = getServerEnv()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Variável de ambiente obrigatória ausente: ${String(key)}`);
  }
  return value as NonNullable<ReturnType<typeof getServerEnv>[K]>;
}
