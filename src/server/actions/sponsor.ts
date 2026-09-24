"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { safeSponsorPath, SPONSOR_HOME } from "@/lib/sponsorPaths";
import { createSupabaseAuthRepository } from "@/repositories/supabase/authRepository";
import { getPublicSponsorService, getSponsorActor, getSponsorService } from "@/server/sponsor";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getRequestEvidence, getTermsService } from "@/server/terms";
import { toActionError, type ActionState } from "./action-state";

/**
 * Server actions da área /patrocinador.
 *
 * Login e cadastro de credenciais reaproveitam signInAction/signUpAction
 * (mesmo rate limit, mesma proteção de open redirect) com `next` apontando
 * para cá. Estas actions cuidam do que é próprio do patrocinador.
 */

export async function createSponsorAccountAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  const next = safeSponsorPath(formData.get("next"));
  try {
    const actor = await getSponsorActor();

    // Aceite dos termos na criação do cadastro: o checkbox required é só UX,
    // a verdade é aqui (mesma postura do onboarding da igreja).
    const terms = await getTermsService();
    if (!(await terms.hasAcceptedCurrent("patrocinador"))) {
      if (formData.get("accept_terms") !== "on") {
        throw new AppError(
          "validation_error",
          "Você precisa aceitar os termos de uso para continuar",
        );
      }
      const evidence = await getRequestEvidence();
      await terms.acceptCurrentTerms("patrocinador", evidence);
      await terms.setConsent(
        "email_communications",
        formData.get("email_consent") === "on",
        evidence,
      );
    }

    const service = await getSponsorService();
    await service.createAccount(
      {
        kind: formData.get("kind"),
        displayName: formData.get("displayName"),
        document: formData.get("document"),
        phone: formData.get("phone") ?? "",
        visibleOnPage: formData.get("visibleOnPage") === "on",
      },
      actor,
    );
  } catch (err) {
    return toActionError(err);
  }
  redirect(next);
}

/**
 * Assinatura iniciada na PÁGINA PÚBLICA, sem login. Devolve estado em vez de
 * redirecionar quando a conta já existe (aí a tela pede para conferir o
 * email); quando há fatura, redireciona para o provedor.
 */
export async function startPublicSponsorshipAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let destination: string | null = null;
  try {
    const service = getPublicSponsorService();
    const evidence = await getRequestEvidence();
    const result = await service.startPublicSponsorship(
      {
        churchPublicCode: formData.get("churchPublicCode"),
        kind: formData.get("kind"),
        displayName: formData.get("displayName"),
        email: formData.get("email"),
        document: formData.get("document"),
        phone: formData.get("phone") ?? "",
        visibleOnPage: formData.get("visibleOnPage") === "on",
        acceptTerms: formData.get("accept_terms") === "on",
        emailConsent: formData.get("email_consent") === "on",
      },
      evidence,
    );

    if (result.kind === "checkout") {
      // URL do provedor de pagamento, não do usuário.
      destination = result.invoiceUrl;
    } else if (result.kind === "done") {
      const code = String(formData.get("churchPublicCode") ?? "");
      destination = `${SPONSOR_HOME}/patrocinar/${encodeURIComponent(code)}/obrigado`;
    } else {
      // Conta já existente: mensagem idêntica à de sucesso comum, para não
      // revelar que o email é cadastrado.
      return {
        success:
          "Enviamos um link para o seu email para concluir o patrocínio. Confira sua caixa de entrada.",
      };
    }
  } catch (err) {
    // Devolve o que foi digitado: sem isso o form volta em branco no erro
    // (rate limit, recusa do provedor etc.) e a pessoa perde o preenchimento.
    return {
      ...toActionError(err),
      values: {
        kind: String(formData.get("kind") ?? ""),
        displayName: String(formData.get("displayName") ?? ""),
        email: String(formData.get("email") ?? ""),
        document: String(formData.get("document") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        visibleOnPage: formData.get("visibleOnPage") === "on" ? "on" : "",
      },
    };
  }
  redirect(destination);
}

/**
 * Pede o link de acesso (login sem senha). A resposta é sempre a mesma,
 * exista ou não a conta — dizer "email não encontrado" entregaria quem é
 * cadastrado para quem ficasse testando endereços.
 */
export async function requestSponsorAccessLinkAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const service = getPublicSponsorService();
    const evidence = await getRequestEvidence();
    await service.requestAccessLink(formData.get("email"), evidence);
  } catch (err) {
    return toActionError(err);
  }
  return {
    success:
      "Se este email tiver uma conta de patrocinador, o link de acesso chega em instantes. Confira sua caixa de entrada.",
  };
}

export async function updateSponsorProfileAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const service = await getSponsorService();
    await service.updateProfile({
      displayName: formData.get("displayName"),
      phone: formData.get("phone") ?? "",
    });
    revalidatePath(SPONSOR_HOME, "layout");
    return { success: "Cadastro atualizado" };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Confirma o patrocínio. É um <form action>, então pode redirecionar: para a
 * fatura do provedor quando há pagamento a fazer agora, ou para a lista.
 */
export async function startSponsorshipAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  let destination: string;
  try {
    const actor = await getSponsorActor();
    const service = await getSponsorService();
    const result = await service.startSponsorship(formData.get("churchId"), actor);
    revalidatePath(SPONSOR_HOME, "layout");
    // A URL vem do provedor de pagamento, não do usuário.
    destination = result.invoiceUrl ?? `${SPONSOR_HOME}/patrocinios?novo=1`;
  } catch (err) {
    return toActionError(err);
  }
  redirect(destination);
}

/**
 * Cancelamento. Chamada imperativa (botão com confirmação), então devolve
 * ActionState e o client atualiza — redirect aqui viraria "erro" no catch.
 */
export async function cancelSponsorshipAction(sponsorshipId: string): Promise<ActionState> {
  try {
    const actor = await getSponsorActor();
    const service = await getSponsorService();
    const { sponsorship, billingSyncPending } = await service.cancelSponsorship(
      sponsorshipId,
      actor,
    );
    revalidatePath(SPONSOR_HOME, "layout");

    const endsAt = sponsorship.ends_at
      ? new Date(sponsorship.ends_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : null;
    const base =
      sponsorship.status === "cancel_scheduled" && endsAt
        ? `Patrocínio cancelado. A igreja segue exibindo seu apoio até ${endsAt}, e o novo valor vale a partir da próxima cobrança.`
        : "Patrocínio cancelado.";
    return {
      success: billingSyncPending
        ? `${base} A atualização do valor no meio de pagamento está em andamento.`
        : base,
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function sponsorSignOutAction(): Promise<void> {
  const client = await getSupabaseServerClient();
  await createSupabaseAuthRepository(client).signOut();
  redirect(`${SPONSOR_HOME}/login`);
}
