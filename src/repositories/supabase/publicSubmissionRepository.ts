import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PublicSubmissionRepository } from "@/services/publicSubmissionService";

/**
 * Gravação do que o visitante envia. `company_id` NÃO vai daqui: um trigger
 * preenche a partir da igreja (migration 20260917160000) — se viesse do
 * cliente, bastaria mandar o id de outra empresa para cair na caixa dela.
 */
export function createSupabasePublicSubmissionRepository(
  client: SupabaseClient,
): PublicSubmissionRepository {
  return {
    async insertPrayerRequest({ churchId, name, message }) {
      const { error } = await client
        .from("prayer_requests")
        .insert({ church_id: churchId, name, message });
      if (error) {
        throw new AppError("internal_error", "Não foi possível enviar o seu pedido.", error);
      }
    },

    async insertVisitor({ churchId, name, contact }) {
      const { error } = await client
        .from("visitors")
        .insert({ church_id: churchId, name, contact });
      if (error) {
        throw new AppError("internal_error", "Não foi possível registrar a sua visita.", error);
      }
    },

    async insertEventSignup({ churchId, eventName, personName, contact }) {
      const { error } = await client.from("event_signups").insert({
        church_id: churchId,
        event_name: eventName,
        person_name: personName,
        contact,
      });
      if (error) {
        throw new AppError("internal_error", "Não foi possível registrar a inscrição.", error);
      }
    },
  };
}
