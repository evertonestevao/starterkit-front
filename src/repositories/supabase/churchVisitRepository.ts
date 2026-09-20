import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { ChurchVisitRepository } from "@/services/churchVisitService";
import type { ChurchWeekVisits, PilotSummary, SponsorChurchMonthVisits } from "@/types/metrics";

/**
 * Gravação de visita. Recebe o client de `service_role`: não existe GRANT de
 * insert para anon/authenticated — com a chave pública, qualquer um inflaria
 * o número que o patrocinador vê.
 */
export function createSupabaseChurchVisitRepository(adminClient: SupabaseClient): ChurchVisitRepository {
  return {
    async insertVisit({ churchId, origem }) {
      const { error } = await adminClient
        .from("church_page_visits")
        .insert({ church_id: churchId, origem });
      if (error) throw new AppError("internal_error", "Falha ao registrar visita", error);
    },
  };
}

/** Leituras das métricas. Client do usuário: as RPCs decidem o que ele vê. */
export function createSupabaseVisitMetricsRepository(client: SupabaseClient) {
  return {
    async listSponsorChurchVisits(months = 6): Promise<SponsorChurchMonthVisits[]> {
      const { data, error } = await client.rpc("sponsor_church_visits", { p_months: months });
      if (error) throw new AppError("internal_error", "Falha ao carregar as visitas", error);
      return ((data ?? []) as Array<{ church_id: string; church_name: string; mes: string; visitas: number }>).map(
        (row) => ({ churchId: row.church_id, churchName: row.church_name, mes: row.mes, visitas: row.visitas }),
      );
    },

    async getPilotSummary(): Promise<PilotSummary> {
      const { data, error } = await client.rpc("platform_pilot_summary").maybeSingle<{
        patrocinadores_pagantes: number;
        patrocinadores_em_atraso: number;
        patrocinios_no_ar: number;
        cobrancas_pagas: number;
        renovacoes: number;
        recebido_mes_cents: number | string;
      }>();
      if (error || !data) throw new AppError("internal_error", "Falha ao carregar o resumo do piloto", error);
      return {
        patrocinadoresPagantes: data.patrocinadores_pagantes,
        patrocinadoresEmAtraso: data.patrocinadores_em_atraso,
        patrociniosNoAr: data.patrocinios_no_ar,
        cobrancasPagas: data.cobrancas_pagas,
        renovacoes: data.renovacoes,
        // bigint chega como string pelo PostgREST.
        recebidoMesCents: Number(data.recebido_mes_cents),
      };
    },

    async listVisitsByWeek(weeks = 8): Promise<ChurchWeekVisits[]> {
      const { data, error } = await client.rpc("platform_visits_by_week", { p_weeks: weeks });
      if (error) throw new AppError("internal_error", "Falha ao carregar as visitas", error);
      return ((data ?? []) as Array<{
        church_id: string;
        church_name: string;
        semana: string;
        total: number;
        qr: number;
        nfc: number;
      }>).map((row) => ({
        churchId: row.church_id,
        churchName: row.church_name,
        semana: row.semana,
        total: row.total,
        qr: row.qr,
        nfc: row.nfc,
      }));
    },
  };
}

/** Registro de "copiei a chave PIX". Mesma regra das visitas: só service_role. */
export function createSupabasePixCopyRepository(adminClient: SupabaseClient) {
  return {
    async insertCopy(churchId: string): Promise<void> {
      const { error } = await adminClient.from("church_pix_copies").insert({ church_id: churchId });
      if (error) throw new AppError("internal_error", "Falha ao registrar a cópia", error);
    },
  };
}

/** Cópias da chave PIX por igreja e semana (painel da plataforma). */
export async function listPixCopiesByWeek(
  client: SupabaseClient,
  weeks = 8,
): Promise<Array<{ churchId: string; churchName: string; semana: string; copias: number }>> {
  const { data, error } = await client.rpc("platform_pix_copies_by_week", { p_weeks: weeks });
  if (error) throw new AppError("internal_error", "Falha ao carregar as cópias da chave", error);
  return ((data ?? []) as Array<{
    church_id: string;
    church_name: string;
    semana: string;
    copias: number;
  }>).map((row) => ({
    churchId: row.church_id,
    churchName: row.church_name,
    semana: row.semana,
    copias: row.copias,
  }));
}
