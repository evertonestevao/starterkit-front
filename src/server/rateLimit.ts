import { AppError } from "@/lib/errors";
import { getServerEnv, requireServerEnv } from "@/config/env";

/**
 * Rate limit por chave. Interface estável consumida pelos services/actions;
 * a implementação vem da factory `createRateLimiter`, escolhida por env:
 *
 *   RATE_LIMIT_STORE=memory  (default) — janela deslizante em memória do
 *     processo. Suficiente para dev e deploy single-node. Em serverless
 *     (Vercel), cada instância tem seu contador — praticamente inócuo.
 *   RATE_LIMIT_STORE=redis — janela fixa no Upstash Redis via REST (sem SDK,
 *     mesmo padrão dos outros adapters). Vale entre instâncias/deploys.
 *
 * Obrigatório em: login, recuperação de senha, envio de convite (CLAUDE.md).
 */

export interface RateLimiter {
  /** Lança AppError("rate_limited") se a chave estourar o limite na janela. */
  consume(key: string): Promise<void>;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Injetável nos testes. */
  now?: () => number;
}

export function createMemoryRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { limit, windowMs, now = Date.now } = options;
  const hits = new Map<string, number[]>();

  return {
    async consume(key: string): Promise<void> {
      const current = now();
      const windowStart = current - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > windowStart);
      if (recent.length >= limit) {
        hits.set(key, recent);
        throw new AppError("rate_limited", "Muitas tentativas. Aguarde um momento.");
      }
      recent.push(current);
      hits.set(key, recent);
    },
  };
}

interface UpstashConfig extends RateLimiterOptions {
  restUrl: string;
  restToken: string;
  /** Injetável nos testes (default: fetch global). */
  fetchFn?: typeof fetch;
}

/**
 * Janela FIXA no Upstash: INCR numa chave por janela + PEXPIRE. Mais grosseira
 * que a deslizante (pode deixar passar até 2x o limite na virada da janela),
 * porém atômica, barata e suficiente para anti força bruta.
 *
 * Decisão consciente: em erro de rede/Upstash o limiter FALHA ABERTO (permite
 * e loga) — indisponibilidade do Redis não pode derrubar o login inteiro.
 */
export function createUpstashRateLimiter(config: UpstashConfig): RateLimiter {
  const { limit, windowMs, restUrl, restToken, now = Date.now } = config;
  const fetchFn = config.fetchFn ?? fetch;
  const base = restUrl.replace(/\/+$/, "");

  return {
    async consume(key: string): Promise<void> {
      const windowId = Math.floor(now() / windowMs);
      const redisKey = `ratelimit:${key}:${windowId}`;

      let count: number;
      try {
        const res = await fetchFn(`${base}/pipeline`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${restToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            ["INCR", redisKey],
            // NX: só define o TTL na criação da chave, não a cada hit.
            ["PEXPIRE", redisKey, String(windowMs), "NX"],
          ]),
        });
        if (!res.ok) {
          throw new Error(`Upstash respondeu ${res.status}`);
        }
        const results = (await res.json()) as Array<{ result?: unknown; error?: string }>;
        if (results[0]?.error) {
          throw new Error(results[0].error);
        }
        count = Number(results[0]?.result);
        if (!Number.isFinite(count)) {
          throw new Error("resposta inesperada do Upstash");
        }
      } catch (err) {
        // WARN explícito e grepável: em produção, uma instabilidade do
        // Upstash significa rate limit DESLIGADO — precisa aparecer nos
        // logs/alertas, nunca passar despercebido.
        console.warn(
          `[rate-limit] FAIL-OPEN: Upstash indisponível — permitindo "${key}" SEM rate limit.`,
          err,
        );
        return; // fail-open
      }

      if (count > limit) {
        throw new AppError("rate_limited", "Muitas tentativas. Aguarde um momento.");
      }
    },
  };
}

/** Factory usada pelas server actions: escolhe o store pela env. */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  if (getServerEnv().RATE_LIMIT_STORE === "redis") {
    return createUpstashRateLimiter({
      ...options,
      restUrl: requireServerEnv("UPSTASH_REDIS_REST_URL"),
      restToken: requireServerEnv("UPSTASH_REDIS_REST_TOKEN"),
    });
  }
  return createMemoryRateLimiter(options);
}
