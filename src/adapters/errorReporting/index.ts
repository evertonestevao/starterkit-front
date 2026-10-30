import "server-only";
import { getServerEnv, requireServerEnv } from "@/config/env";
import { createConsoleReporter } from "./consoleReporter";
import type { ErrorReporter } from "./ErrorReporter";
import { createSentryReporter } from "./sentryReporter";

export type { ErrorContext, ErrorReporter } from "./ErrorReporter";

let reporter: ErrorReporter | undefined;

/** Reporter ativo, escolhido por ERROR_REPORTER (env de servidor). */
export function getErrorReporter(): ErrorReporter {
  if (!reporter) {
    const env = getServerEnv();
    switch (env.ERROR_REPORTER) {
      case "sentry":
        reporter = createSentryReporter({
          dsn: requireServerEnv("SENTRY_DSN"),
          environment: env.APP_ENV,
        });
        break;
      case "console":
        reporter = createConsoleReporter();
        break;
    }
  }
  return reporter;
}

/** Atalho para os pontos de captura (actions, route handlers, instrumentation). */
export function reportError(error: unknown, context: Parameters<ErrorReporter["captureException"]>[1]) {
  return getErrorReporter().captureException(error, context);
}
