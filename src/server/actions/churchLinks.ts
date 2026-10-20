"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { getChurchLinkService } from "@/server/churchLinks";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { toActionError, type ActionState } from "./action-state";

/** Server actions do vínculo entre igrejas. */

const PAGINA = "/dashboard/settings/vinculos";

function texto(formData: FormData, campo: string): string {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor : "";
}

async function ator() {
  // Empresa e papel vêm da sessão, nunca do formulário.
  const { active } = await getActiveTenant();
  if (!active) throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new AppError("unauthorized", "Sessão expirada.");
  return { companyId: active.id, role: active.role, userId: data.user.id };
}

function atualizarTelas() {
  revalidatePath(PAGINA);
  revalidatePath("/dashboard");
}

/** Estado devolvido ao formulário de link: além da mensagem, o link gerado. */
export interface CreateLinkState extends ActionState {
  url?: string;
}

/** Gera o link. O texto do token só existe nesta resposta: depois disso o banco guarda só o hash. */
export async function createChurchLinkInviteAction(
  _prev: CreateLinkState | undefined,
  formData: FormData,
): Promise<CreateLinkState> {
  try {
    const actor = await ator();
    // Sem padrão: o que não veio marcado chega como undefined e o service pede a escolha.
    const validade = texto(formData, "validade");
    const limite = texto(formData, "limite");
    const usos = texto(formData, "maxUses");
    const { url } = await (await getChurchLinkService()).createInvite(actor, {
      churchId: texto(formData, "churchId"),
      tipo: texto(formData, "tipo"),
      validityDays: validade === "sem" ? null : validade === "" ? undefined : Number(validade),
      maxUses: limite === "sem" ? null : limite === "limitar" && usos !== "" ? Number(usos) : undefined,
    });
    revalidatePath(PAGINA);
    return { success: "Link gerado. Envie aos pastores das igrejas que você quer convidar para a sua rede.", url };
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeChurchLinkInviteAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getChurchLinkService()).revokeInvite(await ator(), texto(formData, "inviteId"));
    revalidatePath(PAGINA);
    return { success: "Link cancelado. Quem ainda não usou não consegue mais." };
  } catch (err) {
    return toActionError(err);
  }
}

/** A igreja de baixo pede o vínculo. Nada muda na árvore até a superior aprovar. */
export async function requestChurchLinkAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getChurchLinkService()).requestLink(await ator(), {
      token: texto(formData, "token"),
      churchId: texto(formData, "churchId"),
    });
    atualizarTelas();
    return { success: "Pedido enviado. A igreja que mandou o link foi avisada e vai responder." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function cancelChurchLinkRequestAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getChurchLinkService()).cancelRequest(await ator(), texto(formData, "requestId"));
    atualizarTelas();
    return { success: "Pedido cancelado." };
  } catch (err) {
    return toActionError(err);
  }
}

/** A superior aprova (podendo ajustar a posição) ou recusa. Só aprovar muda a árvore. */
export async function decideChurchLinkRequestAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    const aprovar = texto(formData, "decisao") === "aprovar";
    const tipo = texto(formData, "tipo");
    await (await getChurchLinkService()).decideRequest(await ator(), {
      requestId: texto(formData, "requestId"),
      approve: aprovar,
      ...(tipo === "" ? {} : { tipo }),
      motivo: texto(formData, "motivo"),
    });
    atualizarTelas();
    return {
      success: aprovar
        ? "Vínculo aprovado. A igreja entrou na sua rede e foi avisada."
        : "Pedido recusado. A igreja foi avisada.",
    };
  } catch (err) {
    return toActionError(err);
  }
}

/** A superior muda a posição de uma igreja da árvore dela; a igreja movida é avisada. */
export async function changeChurchPositionAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    // "<id da igreja acima>|<posição>": o destino e a posição andam juntos, para não se descasarem.
    const [novoPai, tipo] = texto(formData, "destino").split("|");
    await (await getChurchLinkService()).changePosition(await ator(), {
      childId: texto(formData, "childId"),
      tipo,
      newParentId: novoPai || null,
    });
    atualizarTelas();
    return { success: "Função alterada. A igreja foi avisada." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function endChurchLinkAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getChurchLinkService()).endLink(await ator(), texto(formData, "churchId"));
    atualizarTelas();
    return { success: "Vínculo desfeito. A outra igreja foi avisada." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function dismissChurchLinkNoticeAction(
  _prev: ActionState | undefined,
  formData: FormData,
): Promise<ActionState> {
  try {
    await (await getChurchLinkService()).dismissNotice(await ator(), texto(formData, "noticeId"));
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return toActionError(err);
  }
}
