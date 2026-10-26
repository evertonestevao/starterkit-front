import { reportError } from "@/adapters/errorReporting";
import { isAppError, type AppErrorCode } from "@/lib/errors";

/** Estado devolvido pelas server actions aos forms (useActionState). */
export interface ActionState {
  error?: string;
  success?: string;
}

/** Códigos que indicam falha nossa ou de provedor — vão ao monitoramento. */
const REPORTABLE_CODES: ReadonlySet<AppErrorCode> = new Set([
  "internal_error",
  "payment_error",
  "email_error",
]);

/** Converte erro em ActionState seguro (nunca vaza detalhe interno). */
export function toActionError(err: unknown): ActionState {
  if (isAppError(err)) {
    if (REPORTABLE_CODES.has(err.code)) {
      void reportError(err, { source: "action" });
    }
    return { error: err.message };
  }
  void reportError(err, { source: "action" });
  return { error: "Erro interno. Tente novamente." };
}
