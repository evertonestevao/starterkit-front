"use server";

import { z } from "zod";
import { AppError } from "@/lib/errors";
import { toActionError, type ActionState } from "@/server/actions/action-state";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getCommissionService } from "./server";

const failureIdSchema = z.uuid();

/** Reprocesso manual de uma pendência de comissão. Só o super admin. */
export async function reprocessCommissionFailureAction(failureId: unknown): Promise<ActionState> {
  try {
    const client = await getSupabaseServerClient();
    const { data: isSuperAdmin, error } = await client.rpc("is_super_admin");
    if (error || isSuperAdmin !== true) {
      throw new AppError("forbidden", "Apenas o super admin reprocessa comissões");
    }

    const id = failureIdSchema.safeParse(failureId);
    if (!id.success) {
      throw new AppError("validation_error", "Pendência inválida");
    }

    const resolved = await getCommissionService().reprocessFailure(id.data);
    return resolved ? { success: "Comissão reprocessada" } : { error: "A comissão falhou de novo" };
  } catch (err) {
    return toActionError(err);
  }
}
