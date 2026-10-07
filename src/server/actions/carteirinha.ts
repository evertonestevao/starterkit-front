"use server";

import { revalidatePath } from "next/cache";
import { getServerEnv } from "@/config/env";
import { MAX_FOTO_BYTES } from "@/lib/carteirinha";
import { AppError } from "@/lib/errors";
import { getCarteirinhaActorAutorizado, getCarteirinhaService } from "@/server/carteirinha";
import { toActionError, type ActionState } from "./action-state";

/** Server actions do consentimento, da foto e da carteirinha do membro. */

async function ator() {
  const actor = await getCarteirinhaActorAutorizado();
  if (!actor) throw new AppError("forbidden", "Você não tem acesso aos membros desta igreja.");
  return actor;
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const marcado = (fd: FormData, campo: string) => fd.get(campo) === "on" || fd.get(campo) === "true";
const revalidar = (membroId: string) => revalidatePath(`/dashboard/membros/${membroId}`);

export async function registrarConsentimentoAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const membroId = texto(fd, "membroId");
    const cadastro = marcado(fd, "cadastro");
    await (
      await getCarteirinhaService()
    ).registrarConsentimento(await ator(), membroId, {
      cadastro,
      foto: marcado(fd, "foto"),
      carteirinha: marcado(fd, "carteirinha"),
      assinadoEm: texto(fd, "assinadoEm") || null,
      responsavelNome: texto(fd, "responsavelNome") || null,
    });
    revalidar(membroId);
    revalidatePath("/dashboard/membros/sem-termo");
    return { success: cadastro ? "Termo registrado." : "Consentimento retirado. Foto e carteirinha foram removidas." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function enviarFotoMembroAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const membroId = texto(fd, "membroId");
    const arquivo = fd.get("foto");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new AppError("validation_error", "Escolha uma foto.");
    // Antes de ler: não carrega na memória um arquivo que já se sabe grande demais.
    if (arquivo.size > MAX_FOTO_BYTES) throw new AppError("validation_error", "A foto passou de 1 MB.");
    await (
      await getCarteirinhaService()
    ).enviarFoto(await ator(), membroId, new Uint8Array(await arquivo.arrayBuffer()));
    revalidar(membroId);
    return { success: "Foto salva." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function removerFotoMembroAction(membroId: string): Promise<ActionState> {
  try {
    await (await getCarteirinhaService()).removerFoto(await ator(), membroId);
    revalidar(membroId);
    return { success: "Foto removida." };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Emite (ou renova) a carteirinha. Devolve o link pessoal: é a única vez em
 * que ele existe em texto — o banco guarda só o hash.
 */
export async function emitirCarteirinhaAction(
  membroId: string,
  validade: string,
): Promise<{ error?: string; link?: string }> {
  try {
    const { token } = await (await getCarteirinhaService()).emitir(await ator(), membroId, validade);
    revalidar(membroId);
    return { link: `${getServerEnv().APP_URL.replace(/\/+$/, "")}/carteirinha/${token}` };
  } catch (err) {
    return { error: toActionError(err).error };
  }
}

export async function cancelarCarteirinhaAction(membroId: string): Promise<ActionState> {
  try {
    await (await getCarteirinhaService()).cancelar(await ator(), membroId);
    revalidar(membroId);
    return { success: "Carteirinha cancelada. O link e o QR Code deixaram de valer." };
  } catch (err) {
    return toActionError(err);
  }
}
