import { isAppError } from "@/lib/errors";

/** Estado devolvido pelas server actions aos forms (useActionState). */
export interface ActionState {
  error?: string;
  success?: string;
}

/** Converte erro em ActionState seguro (nunca vaza detalhe interno). */
export function toActionError(err: unknown): ActionState {
  if (isAppError(err)) {
    return { error: err.message };
  }
  console.error("[action] erro não tratado:", err);
  return { error: "Erro interno. Tente novamente." };
}
