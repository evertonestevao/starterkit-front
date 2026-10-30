/**
 * Health check para monitor de uptime e deploy. Cada dependência é uma
 * checagem com timeout; a resposta pública diz só "ok"/"fail" por item —
 * mensagem de erro e detalhes internos nunca saem daqui.
 */

export type HealthCheck = () => Promise<void>;

export interface HealthReport {
  status: "ok" | "fail";
  checks: Record<string, "ok" | "fail">;
  timestamp: string;
}

interface HealthServiceDeps {
  checks: Record<string, HealthCheck>;
  timeoutMs?: number;
  now?: () => Date;
  /** Recebe a falha para log no servidor. */
  onFailure?: (name: string, err: unknown) => void;
}

function withTimeout(check: HealthCheck, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout após ${timeoutMs}ms`)), timeoutMs);
    check().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function createHealthService({
  checks,
  timeoutMs = 3000,
  now = () => new Date(),
  onFailure,
}: HealthServiceDeps) {
  async function run(): Promise<HealthReport> {
    const entries = await Promise.all(
      Object.entries(checks).map(async ([name, check]) => {
        try {
          await withTimeout(check, timeoutMs);
          return [name, "ok"] as const;
        } catch (err) {
          onFailure?.(name, err);
          return [name, "fail"] as const;
        }
      }),
    );
    const results = Object.fromEntries(entries);
    return {
      status: entries.every(([, result]) => result === "ok") ? "ok" : "fail",
      checks: results,
      timestamp: now().toISOString(),
    };
  }

  return { run };
}
