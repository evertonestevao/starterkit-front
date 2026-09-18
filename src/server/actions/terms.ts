"use server";

import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getRequestEvidence, getTermsService } from "@/server/terms";
import { toActionError, type ActionState } from "./action-state";

/**
 * Aceite dos termos vigentes (+ consentimento opcional de email).
 * Usada pela página /accept-terms (reaceite e usuários convidados).
 */
export async function acceptTermsAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    if (formData.get("accept_terms") !== "on") {
      throw new AppError("validation_error", "Você precisa aceitar os termos para continuar");
    }
    const terms = await getTermsService();
    const evidence = await getRequestEvidence();
    await terms.acceptCurrentTerms("igreja", evidence);
    // Consentimento de email é separado e explícito: grava a escolha
    // (positiva OU negativa) como evento — evidência nos dois sentidos.
    await terms.setConsent(
      "email_communications",
      formData.get("email_consent") === "on",
      evidence,
    );
  } catch (err) {
    return toActionError(err);
  }
  redirect("/dashboard");
}
