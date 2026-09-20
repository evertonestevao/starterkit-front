import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CommunityCounts, CommunityRepository } from "@/services/communityService";
import type { EventSignup, PrayerRequest, Visitor } from "@/types/database";

/**
 * Leitura do que a comunidade enviou. O filtro por company_id é repetido em
 * toda query (não só na RLS), como manda o CLAUDE.md para dado sensível.
 */
/**
 * Contagem de pedidos por igreja da minha subárvore. Quem está ACIMA (sede,
 * subsede) recebe só o número — o texto fica na igreja que recebeu o pedido.
 */
export async function listPrayerCountsTree(
  client: SupabaseClient,
  dias = 30,
): Promise<Array<{ churchId: string; churchName: string; total: number }>> {
  const { data, error } = await client.rpc("prayer_counts_tree", { p_dias: dias });
  if (error) throw new AppError("internal_error", "Falha ao carregar as contagens", error);
  return ((data ?? []) as Array<{ church_id: string; church_name: string; total: number }>).map(
    (row) => ({ churchId: row.church_id, churchName: row.church_name, total: row.total }),
  );
}

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

  return {
    listPrayerRequests: (companyId, opts) =>
      listTable<PrayerRequest>("prayer_requests", companyId, opts, "Falha ao listar pedidos de oração"),

    listEventSignups: (companyId, opts) =>
      listTable<EventSignup>("event_signups", companyId, opts, "Falha ao listar inscrições"),

    listVisitors: (companyId, opts) =>
      listTable<Visitor>("visitors", companyId, opts, "Falha ao listar visitantes"),

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
  };
}
