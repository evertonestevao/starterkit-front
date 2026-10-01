import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CommunityCounts, CommunityRepository } from "@/services/communityService";
import type { EventSignup, PrayerRequest, Visitor } from "@/types/database";

/**
 * Leitura do que a comunidade enviou. O filtro por company_id é repetido em
 * toda query (não só na RLS), como manda o CLAUDE.md para dado sensível.
 * Pedido de oração é só da igreja que recebeu: nada aqui agrega entre
 * igrejas, nem a contagem — o RPC `prayer_counts_tree` continua no banco
 * (testado em rls_test.sql), mas nenhuma tela chama mais.
 */
export function createSupabaseCommunityRepository(client: SupabaseClient): CommunityRepository {
  async function listTable<T>(
    table: string,
    companyId: string,
    { limit, offset, eventId }: { limit: number; offset: number; eventId?: string },
    errorMessage: string,
  ): Promise<{ items: T[]; total: number }> {
    let query = client
      .from(table)
      .select("*", { count: "exact" })
      .eq("company_id", companyId);
    if (eventId) query = query.eq("event_id", eventId);
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) {
      throw new AppError("internal_error", errorMessage, error);
    }
    return { items: (data ?? []) as T[], total: count ?? 0 };
  }

  async function countSince(table: string, companyId: string, since: string): Promise<number> {
    const { count, error } = await client
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .gte("created_at", since);
    if (error) {
      throw new AppError("internal_error", "Falha ao contar registros", error);
    }
    return count ?? 0;
  }

  async function countAllRows(table: string, companyId: string): Promise<number> {
    const { count, error } = await client
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if (error) {
      throw new AppError("internal_error", "Falha ao contar registros", error);
    }
    return count ?? 0;
  }

  /**
   * Período em dias de Brasília: "até 10/10" inclui o dia 10 inteiro.
   * (-03:00 fixo: o Brasil não tem mais horário de verão.)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function noPeriodo<Q extends { gte: any; lt: any }>(query: Q, { de, ate }: { de?: string; ate?: string }): Q {
    let q = query;
    if (de) q = q.gte("created_at", `${de}T00:00:00-03:00`);
    if (ate) {
      const fim = new Date(`${ate}T00:00:00-03:00`);
      fim.setUTCDate(fim.getUTCDate() + 1);
      q = q.lt("created_at", fim.toISOString());
    }
    return q;
  }

  return {
    listPrayerRequests: (companyId, opts) =>
      listTable<PrayerRequest>("prayer_requests", companyId, opts, "Falha ao listar pedidos de oração"),

    listEventSignups: (companyId, opts) =>
      listTable<EventSignup>("event_signups", companyId, opts, "Falha ao listar inscrições"),

    async listVisitors(companyId, { limit, offset, situacao, de, ate }) {
      let query = noPeriodo(
        client.from("visitors").select("*", { count: "exact" }).eq("company_id", companyId).is("deleted_at", null),
        { de, ate },
      );
      if (situacao === "pendentes") query = query.is("visitado_em", null);
      if (situacao === "feitas") query = query.not("visitado_em", "is", null);
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new AppError("internal_error", "Falha ao listar os pedidos de visita", error);
      return { items: (data ?? []) as Visitor[], total: count ?? 0 };
    },

    async countVisitas(companyId, periodo) {
      const base = () =>
        noPeriodo(
          client
            .from("visitors")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .is("deleted_at", null),
          periodo,
        );
      const [pendentes, feitas] = await Promise.all([
        base().is("visitado_em", null),
        base().not("visitado_em", "is", null),
      ]);
      const error = pendentes.error ?? feitas.error;
      if (error) throw new AppError("internal_error", "Falha ao contar os pedidos de visita", error);
      return { pendentes: pendentes.count ?? 0, feitas: feitas.count ?? 0 };
    },

    async registrarVisita({ visitorId, visitadoEm, visitadoPor, observacao }) {
      const { error } = await client.rpc("registrar_visita", {
        p_visitor_id: visitorId,
        p_visitado_em: visitadoEm,
        p_visitado_por: visitadoPor,
        p_obs: observacao,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Pedido de visita não encontrado.", error);
        if (error.code === "22023") throw new AppError("validation_error", "Informe quem fez a visita.", error);
        throw new AppError("internal_error", "Falha ao registrar a visita", error);
      }
    },

    async countAll(companyId, since): Promise<CommunityCounts> {
      const [prayerRequests, eventSignups, visitors, p7, e7, v7] = await Promise.all([
        countAllRows("prayer_requests", companyId),
        countAllRows("event_signups", companyId),
        countAllRows("visitors", companyId),
        countSince("prayer_requests", companyId, since),
        countSince("event_signups", companyId, since),
        countSince("visitors", companyId, since),
      ]);
      return { prayerRequests, eventSignups, visitors, lastWeek: p7 + e7 + v7 };
    },

    async getPrayerSeenAt(companyId) {
      // RLS já restringe a linha à própria sessão (user_id = auth.uid());
      // não existe "ver o quanto outra pessoa já viu" para vazar.
      const { data, error } = await client
        .from("prayer_requests_last_seen")
        .select("seen_at")
        .eq("company_id", companyId)
        .maybeSingle<{ seen_at: string }>();
      if (error) throw new AppError("internal_error", "Falha ao consultar pedidos vistos", error);
      return data?.seen_at ?? null;
    },

    async countPrayerRequestsSince(companyId, since) {
      if (since === null) return countAllRows("prayer_requests", companyId);

      // NÃO é `countSince` (usa >=, pensado para "últimos N dias" com um
      // corte arbitrário): `since` aqui é o `created_at` exato do último
      // pedido que a pessoa já viu, então precisa ser ESTRITO (>). Com >=,
      // esse mesmo pedido nunca deixaria de contar como "não visto" — o
      // badge nunca zeraria.
      const { count, error } = await client
        .from("prayer_requests")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gt("created_at", since);
      if (error) throw new AppError("internal_error", "Falha ao contar pedidos não vistos", error);
      return count ?? 0;
    },

    async markPrayerRequestsSeen(companyId, seenAt) {
      // RPC (não upsert direto): funde com GREATEST, então duas abas abertas
      // não conseguem fazer a marca andar para trás uma da outra. Ver o
      // comentário completo na migration 20260925100000.
      const { error } = await client.rpc("mark_prayer_requests_seen", {
        p_company_id: companyId,
        p_seen_at: seenAt,
      });
      if (error) throw new AppError("internal_error", "Falha ao marcar pedidos como vistos", error);
    },
  };
}
