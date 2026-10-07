"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/lib/errors";
import { getSecretariaActorAutorizado, getSecretariaService } from "@/server/secretaria";
import { toActionError, type ActionState } from "./action-state";

/** Server actions do histórico do membro e dos modelos de documento. */

async function ator() {
  const actor = await getSecretariaActorAutorizado();
  if (!actor) throw new AppError("forbidden", "Você não tem acesso aos membros desta igreja.");
  return actor;
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

export async function anotarHistoricoAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const membroId = texto(fd, "membroId");
    await (
      await getSecretariaService()
    ).anotar(await ator(), membroId, {
      titulo: texto(fd, "titulo"),
      detalhe: texto(fd, "detalhe") || null,
      data: texto(fd, "data") || null,
    });
    revalidatePath(`/dashboard/membros/${membroId}`);
    return { success: "Anotado no histórico." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function excluirAnotacaoAction(id: string, membroId: string): Promise<ActionState> {
  try {
    await (await getSecretariaService()).excluirAnotacao(await ator(), id);
    revalidatePath(`/dashboard/membros/${membroId}`);
    return { success: "Anotação excluída." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function salvarModeloAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    await (
      await getSecretariaService()
    ).salvarModelo(await ator(), texto(fd, "tipo"), {
      titulo: texto(fd, "titulo"),
      corpo: String(fd.get("corpo") ?? ""),
    });
    revalidatePath("/dashboard/settings/documentos");
    return { success: "Modelo salvo. Os próximos documentos já saem com este texto." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function restaurarModeloAction(tipo: string): Promise<ActionState> {
  try {
    await (await getSecretariaService()).restaurarModelo(await ator(), tipo);
    revalidatePath("/dashboard/settings/documentos");
    return { success: "Modelo restaurado." };
  } catch (err) {
    return toActionError(err);
  }
}
