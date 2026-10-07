import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { MensalidadeDaIgreja, MensalidadeRepository } from "@/services/mensalidadeService";

/**
 * Mensalidade por igreja, pela moderação da plataforma. As duas funções do
 * banco conferem `is_platform_staff`: para qualquer outra pessoa a lista vem
 * vazia e a escrita é recusada.
 */
export function createSupabaseMensalidadeRepository(client: SupabaseClient): MensalidadeRepository {
  return {
    async listar() {
      const { data, error } = await client.rpc("platform_mensalidades");
      if (error) throw new AppError("internal_error", "Falha ao carregar as mensalidades", error);
      return (
        (data ?? []) as Array<{
          church_id: string;
          valor_proprio: number | null;
          motivo: string | null;
          valor_padrao: number;
          pagando: boolean;
        }>
      ).map((r): MensalidadeDaIgreja => ({
        churchId: r.church_id,
        valorProprioCents: r.valor_proprio,
        motivo: r.motivo,
        valorPadraoCents: r.valor_padrao,
        pagando: r.pagando,
      }));
    },

    async definir(churchId, amountCents, motivo) {
      const { data, error } = await client.rpc("platform_definir_mensalidade", {
        p_church_id: churchId,
        p_amount_cents: amountCents,
        p_motivo: motivo,
      });
      if (error) {
        if (error.code === "42501")
          throw new AppError("forbidden", "Só a moderação da plataforma altera a mensalidade.");
        if (error.code === "P0002") throw new AppError("not_found", "Igreja não encontrada.");
        if (error.code === "23514" || error.code === "22023") {
          throw new AppError("validation_error", "Confira o valor (mínimo de R$ 5,00) e o motivo.");
        }
        throw new AppError("internal_error", "Falha ao salvar a mensalidade", error);
      }
      return (data as string | null) ?? null;
    },
  };
}
