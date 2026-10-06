import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PublicSubmissionRepository } from "@/services/publicSubmissionService";

/** Janela em que um envio igual ao anterior conta como repetido (toque duplo, formulário reenviado). */
const REPETIDO_ORACAO_MS = 60 * 60_000;
const REPETIDO_VISITA_MS = 6 * 60 * 60_000;

const soDigitos = (t: string) => t.replace(/\D/g, "");

/**
 * Gravação do que o visitante envia. `client` é o de SERVIÇO (ignora RLS):
 * a chave pública não escreve mais aqui. Como não há policy para barrar, a
 * igreja é conferida à mão antes de gravar.
 *
 * `company_id` NÃO vai daqui: um trigger preenche a partir da igreja
 * (migration 20260917160000).
 */
export function createSupabasePublicSubmissionRepository(
  client: SupabaseClient,
): PublicSubmissionRepository {
  async function exigeIgreja(churchId: string): Promise<void> {
    const { data, error } = await client
      .from("churches")
      .select("id")
      .eq("id", churchId)
      .is("deleted_at", null)
      // Página fora do ar não recebe pedido de ninguém.
      .eq("pagina_ativa", true)
      .maybeSingle();
    if (error) throw new AppError("internal_error", "Não foi possível enviar agora. Tente de novo.", error);
    if (!data) throw new AppError("not_found", "Igreja não encontrada.");
  }

  return {
    async insertPrayerRequest({ churchId, name, message }) {
      await exigeIgreja(churchId);
      // Mesmo texto para a mesma igreja há pouco: é reenvio, não um pedido novo.
      const { count } = await client
        .from("prayer_requests")
        .select("id", { count: "exact", head: true })
        .eq("church_id", churchId)
        .eq("message", message)
        .gt("created_at", new Date(Date.now() - REPETIDO_ORACAO_MS).toISOString());
      if ((count ?? 0) > 0) return;

      const { error } = await client
        .from("prayer_requests")
        .insert({ church_id: churchId, name, message });
      if (error) {
        throw new AppError("internal_error", "Não foi possível enviar o seu pedido.", error);
      }
    },

    async insertVisitor({ churchId, name, contact, endereco, mensagem }) {
      await exigeIgreja(churchId);
      // O mesmo telefone pedindo visita à mesma igreja, ainda sem visita feita,
      // nas últimas horas: já há um pedido aberto, não cria outro.
      const { data: recentes } = await client
        .from("visitors")
        .select("contact")
        .eq("church_id", churchId)
        .is("deleted_at", null)
        .is("visitado_em", null)
        .gt("created_at", new Date(Date.now() - REPETIDO_VISITA_MS).toISOString())
        .limit(500);
      const telefone = soDigitos(contact);
      if ((recentes ?? []).some((r: { contact: string }) => soDigitos(r.contact) === telefone)) return;

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
