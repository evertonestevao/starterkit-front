/**
 * Formato único de erro da aplicação (ver CLAUDE.md).
 *
 * Regras:
 * - Tudo que atravessa camadas (repository → service → hook) vira AppError.
 * - O que chega ao usuário é sempre `toPublicError(err)`: código + mensagem
 *   segura. Stack trace e detalhes internos ficam só no log do servidor.
 */

export type AppErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "payment_error"
  | "email_error"
  | "domain_error"
  | "internal_error";

const HTTP_STATUS: Record<AppErrorCode, number> = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payment_error: 502,
  email_error: 502,
  domain_error: 502,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Detalhes internos para log de servidor. Nunca serializar para o client. */
  readonly internal?: unknown;
  /**
   * Campo do formulário que causou o erro (nome do campo, nada interno): a
   * tela mostra a mensagem embaixo dele em vez de só um aviso solto.
   */
  readonly field?: string;

  constructor(code: AppErrorCode, message: string, internal?: unknown, field?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.internal = internal;
    this.field = field;
  }
}

/** Forma segura de erro para respostas HTTP e UI. */
export interface PublicError {
  code: AppErrorCode;
  message: string;
}

/**
 * Converte qualquer erro no formato público. Erros desconhecidos viram
 * internal_error genérico — a mensagem original nunca vaza para o usuário.
 */
export function toPublicError(err: unknown): PublicError {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message };
  }
  return { code: "internal_error", message: "Erro interno. Tente novamente." };
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * Primeira mensagem de um erro de validação do Zod, no formato público. O
 * usuário lê uma frase por vez; a lista inteira só serve para o log.
 */
export function toValidationError(issues: { message: string; path?: PropertyKey[] }[]): AppError {
  const primeiro = issues[0];
  const campo = primeiro?.path?.[0];
  return new AppError(
    "validation_error",
    primeiro?.message ?? "Dados inválidos",
    undefined,
    typeof campo === "string" ? campo : undefined,
  );
}
