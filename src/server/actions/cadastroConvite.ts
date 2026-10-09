"use server";

import { revalidatePath } from "next/cache";
import { getCadastroConviteService } from "@/server/cadastro";
import { requirePlatformStaff } from "@/server/platform";
import { toActionError, type ActionState } from "./action-state";

/** Cadastro só por convite: ações do painel da plataforma (o banco confere de novo). */

const PAGINA = "/plataforma/convites";

export async function definirCadastroAbertoAction(aberto: boolean): Promise<ActionState> {
  try {
    await requirePlatformStaff();
    await (await getCadastroConviteService()).definirCadastroAberto(aberto);
    revalidatePath(PAGINA);
    revalidatePath("/");
    return { success: aberto ? "Cadastro aberto para qualquer igreja." : "Cadastro só por convite." };
  } catch (err) {
    return toActionError(err);
  }
}

/** O link só aparece nesta resposta: o banco guarda o hash. */
export interface ConviteIgrejaGeradoState {
  error?: string;
  campo?: string;
  success?: { link: string; expiraEm: string };
}

export async function gerarConviteIgrejaAction(
  _prev: ConviteIgrejaGeradoState | undefined,
  fd: FormData,
): Promise<ConviteIgrejaGeradoState> {
  try {
    await requirePlatformStaff();
    const gerado = await (await getCadastroConviteService()).gerarConvite({
      descricao: String(fd.get("descricao") ?? ""),
      validadeDias: String(fd.get("validadeDias") ?? "7"),
    });
    revalidatePath(PAGINA);
    return { success: gerado };
  } catch (err) {
    return toActionError(err) as ConviteIgrejaGeradoState;
  }
}

export async function revogarConviteIgrejaAction(id: string): Promise<ActionState> {
  try {
    await requirePlatformStaff();
    await (await getCadastroConviteService()).revogarConvite(id);
    revalidatePath(PAGINA);
    return { success: "Convite cancelado." };
  } catch (err) {
    return toActionError(err);
  }
}
