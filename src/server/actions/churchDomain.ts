"use server";

import { revalidatePath } from "next/cache";
import { churchDomainTargetSchema, customDomainSchema } from "@/features/church/schemas";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/server/audit";
import {
  getChurchDomainService,
  getChurchDomainVerifyService,
  getDomainActor,
} from "@/server/churchDomain";
import { toActionError, type ActionState } from "./action-state";

/** Server actions do domínio próprio da igreja. */

const DOMAIN_PAGE = "/dashboard/settings/domain";

/** Valida o id da igreja no server, mesmo já tendo vindo da nossa própria UI. */
function parseChurchId(churchId: string): string {
  const parsed = churchDomainTargetSchema.safeParse({ churchId });
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      parsed.error.issues[0]?.message ?? "Igreja inválida",
    );
  }
  return parsed.data.churchId;
}

export async function claimCustomDomainAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const parsed = customDomainSchema.safeParse({
      churchId: formData.get("churchId"),
      domain: formData.get("domain"),
    });
    if (!parsed.success) {
      throw new AppError(
        "validation_error",
        parsed.error.issues[0]?.message ?? "Dados inválidos",
      );
    }

    // O ator vem da sessão, nunca do formulário: campo de empresa enviado pelo
    // client seria o caminho óbvio para mexer em igreja de outro tenant.
    const actor = await getDomainActor();
    const service = await getChurchDomainService();
    const view = await service.claimDomain(parsed.data.churchId, parsed.data.domain, actor);

    await recordAudit({
      companyId: actor.companyId,
      action: "church.domain.claimed",
      entityType: "church",
      entityId: parsed.data.churchId,
      metadata: { domain: view.domain, status: view.status },
    });

    revalidatePath(DOMAIN_PAGE);
    return {
      success:
        view.status === "ativo"
          ? "Domínio ativo! Já pode ser acessado."
          : "Domínio cadastrado. Agora crie os registros de DNS mostrados abaixo.",
    };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * "Verificar agora". Chamada imperativa (fora de <form action>), então devolve
 * ActionState e quem navega/atualiza é o client — redirect aqui viajaria como
 * exceção e cairia no catch do componente como se fosse erro.
 */
export async function verifyCustomDomainAction(churchId: string): Promise<ActionState> {
  try {
    const id = parseChurchId(churchId);
    const actor = await getDomainActor();
    const service = await getChurchDomainVerifyService();
    const view = await service.refreshDomain(id, actor);

    revalidatePath(DOMAIN_PAGE);

    if (view.status === "ativo") {
      await recordAudit({
        companyId: actor.companyId,
        action: "church.domain.activated",
        entityType: "church",
        entityId: id,
        metadata: { domain: view.domain },
      });
      return { success: "Domínio verificado e ativo!" };
    }

    return {
      success:
        "Ainda não encontramos os registros de DNS. A propagação pode levar algumas horas — vamos continuar verificando sozinhos.",
    };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removeCustomDomainAction(churchId: string): Promise<ActionState> {
  try {
    const id = parseChurchId(churchId);
    const actor = await getDomainActor();
    const service = await getChurchDomainService();
    const view = await service.removeDomain(id, actor);

    await recordAudit({
      companyId: actor.companyId,
      action: "church.domain.removed",
      entityType: "church",
      entityId: id,
      metadata: { defaultUrl: view.defaultUrl },
    });

    revalidatePath(DOMAIN_PAGE);
    return { success: "Domínio removido. Sua igreja segue no endereço padrão." };
  } catch (err) {
    return toActionError(err);
  }
}
