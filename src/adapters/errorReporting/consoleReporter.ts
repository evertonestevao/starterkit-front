import type { ErrorContext, ErrorReporter } from "./ErrorReporter";

/** Default: só o log do servidor, como antes do monitoramento existir. */
export function createConsoleReporter(): ErrorReporter {
  return {
    name: "console",

    async captureException(error: unknown, context: ErrorContext): Promise<void> {
      console.error(`[error:${context.source}]`, error, context.extra ?? "");
    },
  };
}
