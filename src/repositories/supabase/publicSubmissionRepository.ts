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

    async insertVisitor({ churchId, name, contact, endereco, mensagem }) {
      const { error } = await client
        .from("visitors")
        .insert({ church_id: churchId, name, contact, endereco, mensagem });
      if (error) {
        throw new AppError("internal_error", "Não foi possível enviar o seu pedido de visita.", error);
      }
    },

    async signUpForEvent({ eventId, personName, contact }) {
      const { error } = await client.rpc("sign_up_for_event", {
        p_event_id: eventId,
        p_person_name: personName,
        p_contact: contact,
      });
      if (!error) return;
      // A função do banco escreve as recusas para o visitante ler ("inscrições
      // encerradas", "já começou"); o resto vira mensagem genérica.
      if (error.code === "P0001") throw new AppError("validation_error", error.message, error);
      if (error.code === "P0002") throw new AppError("not_found", "Evento não encontrado.", error);
      throw new AppError("internal_error", "Não foi possível registrar a inscrição.", error);
    },
  };
}
