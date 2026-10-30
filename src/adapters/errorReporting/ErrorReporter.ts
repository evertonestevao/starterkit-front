/**
 * Interface única de monitoramento de erros. Cada provedor (Sentry, Rollbar,
 * Datadog...) implementa em src/adapters/errorReporting — o resto do código
 * só chama captureException.
 *
 * Contrato: captureException NUNCA lança. Falha ao reportar não pode
 * derrubar a request que já está tratando um erro.
 */

export interface ErrorContext {
  /** Onde aconteceu: "action", "route:/api/...", "render"... */
  source: string;
  /** Dados extras. Chaves sensíveis (senha, token, cartão) são removidas antes do envio. */
  extra?: Record<string, unknown>;
}

export interface ErrorReporter {
  readonly name: string;
  captureException(error: unknown, context: ErrorContext): Promise<void>;
}
