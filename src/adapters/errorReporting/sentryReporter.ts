import { isAppError } from "@/lib/errors";
import { sanitizeMetadata } from "@/services/auditService";
import type { ErrorContext, ErrorReporter } from "./ErrorReporter";

interface SentryConfig {
  dsn: string;
  environment: string;
  /** Injetável nos testes (default: fetch global). */
  fetchFn?: typeof fetch;
}

interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

/** DSN no formato https://<chave>@<host>/<projeto>. */
export function parseSentryDsn(dsn: string): ParsedDsn {
  const url = new URL(dsn);
  const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
  if (!url.username || !projectId) {
    throw new Error("SENTRY_DSN inválido");
  }
  return {
    envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    publicKey: url.username,
  };
}

function toSentryException(error: unknown) {
  if (error instanceof Error) {
    return { type: error.name, value: error.message };
  }
  return { type: "NonError", value: String(error) };
}

/**
 * Sentry via API HTTP de envelopes, sem SDK (mesmo padrão do Upstash e do
 * Resend). Cobre o essencial: erro, stack, ambiente e contexto sanitizado.
 * Para breadcrumbs, tracing e source maps, troque por @sentry/nextjs atrás
 * desta mesma interface.
 */
export function createSentryReporter(config: SentryConfig): ErrorReporter {
  const { envelopeUrl, publicKey } = parseSentryDsn(config.dsn);
  const fetchFn = config.fetchFn ?? fetch;

  return {
    name: "sentry",

    async captureException(error: unknown, context: ErrorContext): Promise<void> {
      const eventId = crypto.randomUUID().replace(/-/g, "");
      const extra = sanitizeMetadata({
        ...context.extra,
        stack: error instanceof Error ? error.stack : undefined,
        internal: isAppError(error) ? (error.internal as unknown) : undefined,
      });
      const event = {
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: "javascript",
        level: "error",
        environment: config.environment,
        tags: { source: context.source },
        exception: { values: [toSentryException(error)] },
        extra,
      };
      const body = [
        JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
        JSON.stringify({ type: "event" }),
        JSON.stringify(event),
      ].join("\n");

      try {
        const res = await fetchFn(envelopeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-sentry-envelope",
            "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=starterkit/1.0`,
          },
          body,
        });
        if (!res.ok) {
          throw new Error(`Sentry respondeu ${res.status}`);
        }
      } catch (reportErr) {
        // Nunca lança (contrato da interface); o erro original vai ao log local.
        console.error("[error-reporting] falha ao enviar ao Sentry:", reportErr);
        console.error(`[error:${context.source}]`, error);
      }
    },
  };
}
