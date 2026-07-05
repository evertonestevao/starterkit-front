import { AppError } from "@/lib/errors";

/**
 * Rate limit de janela deslizante. Interface estável; a implementação
 * in-memory serve a uma instância única (dev / deploy single-node). Para
 * múltiplas instâncias, implementar RateLimiter com um store compartilhado
 * (ex.: Upstash/Redis) sem tocar nos services que o consomem.
 *
 * Obrigatório em: login, recuperação de senha, envio de convite (CLAUDE.md).
 */

export interface RateLimiter {
  /** Lança AppError("rate_limited") se a chave estourar o limite na janela. */
  consume(key: string): Promise<void>;
}

interface MemoryRateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Injetável nos testes. */
  now?: () => number;
}

export function createMemoryRateLimiter(options: MemoryRateLimiterOptions): RateLimiter {
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
