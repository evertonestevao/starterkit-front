"use server";

import { revalidatePath } from "next/cache";
import { parseBrlToCents } from "@/lib/churchEvents";
import { AppError } from "@/lib/errors";
import { getTesourariaActorAutorizado, getTesourariaService } from "@/server/tesouraria";
import type { PessoaTesouraria } from "@/types/tesouraria";
import { toActionError, type ActionState } from "./action-state";

/** Server actions da Tesouraria. O service confere o acesso; o banco, de novo. */

async function ator() {
  const actor = await getTesourariaActorAutorizado();
  if (!actor) throw new AppError("forbidden", "Você não tem acesso à tesouraria desta igreja.");
  return actor;
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

/** Novo lançamento, ou edição quando vem `id`. */
export async function salvarLancamentoAction(_prev: ActionState | undefined, fd: FormData): Promise<ActionState> {
  try {
    const actor = await ator();
    const valor = parseBrlToCents(texto(fd, "valor"));
    if (valor === null) throw new AppError("validation_error", "Valor inválido.");
    await (
      await getTesourariaService()
    ).salvar(actor, texto(fd, "id") || null, {
      data: texto(fd, "data"),
      scheduleId: texto(fd, "scheduleId") || null,
      tipo: texto(fd, "tipo"),
      valorCentavos: valor,
      forma: texto(fd, "forma") || "dinheiro",
      membroId: texto(fd, "membroId") || null,
      nome: texto(fd, "nome") || null,
      observacao: texto(fd, "observacao") || null,
    });
    revalidatePath("/dashboard/tesouraria", "layout");
    return { success: texto(fd, "id") ? "Lançamento atualizado." : "Lançamento salvo." };
  } catch (err) {
    return toActionError(err);
  }
}

export async function excluirLancamentoAction(id: string): Promise<ActionState> {
  try {
    await (await getTesourariaService()).excluir(await ator(), id);
    revalidatePath("/dashboard/tesouraria", "layout");
    return { success: "Lançamento excluído." };
  } catch (err) {
    return toActionError(err);
  }
}

/** Sugestões de nome para o dizimista, enquanto se digita. */
export async function buscarPessoasTesourariaAction(
  termo: string,
): Promise<{ pessoas?: PessoaTesouraria[]; error?: string }> {
  try {
    return { pessoas: await (await getTesourariaService()).buscarPessoas(await ator(), termo) };
  } catch (err) {
    return { error: toActionError(err).error };
  }
}
