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
    async listPrayerRequests(companyId, { limit, offset, situacao }) {
      let query = client
        .from("prayer_requests")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .is("oculto_em", null);
      if (situacao === "pendentes") query = query.is("orado_em", null);
      if (situacao === "orados") query = query.not("orado_em", "is", null);
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new AppError("internal_error", "Falha ao listar pedidos de oração", error);
      return { items: (data ?? []) as PrayerRequest[], total: count ?? 0 };
    },

    async countOracoes(companyId) {
      const base = () =>
        client
          .from("prayer_requests")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .is("oculto_em", null);
      const [pendentes, orados] = await Promise.all([base().is("orado_em", null), base().not("orado_em", "is", null)]);
      const error = pendentes.error ?? orados.error;
      if (error) throw new AppError("internal_error", "Falha ao contar os pedidos de oração", error);
      return { pendentes: pendentes.count ?? 0, orados: orados.count ?? 0 };
    },

    async marcarOrados(companyId, ids, orado) {
      const { data, error } = await client.rpc("marcar_pedidos_orados", {
        p_company_id: companyId,
        p_ids: ids,
        p_orado: orado,
      });
      if (error) {
        if (error.code === "42501") {
          throw new AppError("forbidden", "Só quem administra a igreja marca os pedidos de oração.", error);
        }
        throw new AppError("internal_error", "Falha ao marcar os pedidos", error);
      }
      return Number(data ?? 0);
    },

    async ocultarPedidoOracao(id) {
      const { error } = await client.rpc("ocultar_pedido_oracao", { p_id: id });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Pedido não encontrado, ou você não tem permissão para ocultá-lo.", error);
        throw new AppError("internal_error", "Falha ao ocultar o pedido", error);
      }
    },

    async ocultarPedidoVisita(id) {
      const { error } = await client.rpc("ocultar_pedido_visita", { p_id: id });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Pedido não encontrado, ou você não tem permissão para ocultá-lo.", error);
        throw new AppError("internal_error", "Falha ao ocultar o pedido de visita", error);
      }
    },

    async anotarPedido(id, texto) {
      const { error } = await client.rpc("anotar_pedido_oracao", { p_id: id, p_texto: texto });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Pedido não encontrado.", error);
        throw new AppError("internal_error", "Falha ao salvar a anotação", error);
      }
    },

    listEventSignups: (companyId, opts) =>
      listTable<EventSignup>("event_signups", companyId, opts, "Falha ao listar inscrições"),

    async listVisitors(companyId, { limit, offset, situacao, de, ate }) {
      let query = noPeriodo(
        client.from("visitors").select("*", { count: "exact" }).eq("company_id", companyId).is("deleted_at", null),
        { de, ate },
      );
      if (situacao === "novos") query = query.is("visitado_em", null).is("contato_em", null);
      if (situacao === "andamento") query = query.is("visitado_em", null).not("contato_em", "is", null);
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
      const [novos, andamento, feitas] = await Promise.all([
        base().is("visitado_em", null).is("contato_em", null),
        base().is("visitado_em", null).not("contato_em", "is", null),
        base().not("visitado_em", "is", null),
      ]);
      const error = novos.error ?? andamento.error ?? feitas.error;
      if (error) throw new AppError("internal_error", "Falha ao contar os pedidos de visita", error);
      return { novos: novos.count ?? 0, andamento: andamento.count ?? 0, feitas: feitas.count ?? 0 };
    },

    async registrarContato({ visitorId, agendadaPara, observacao, desfazer }) {
      const { error } = await client.rpc("registrar_contato_visita", {
        p_visitor_id: visitorId,
        p_agendada_para: agendadaPara,
        p_obs: observacao,
        p_desfazer: desfazer,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Pedido de visita não encontrado.", error);
        throw new AppError("internal_error", "Falha ao registrar o contato", error);
      }
    },

    async listQuemPodeVisitar(companyId) {
      const { data, error } = await client.rpc("visita_quem_pode_visitar", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar quem pode visitar", error);
      return ((data ?? []) as Array<{ membro_id: string; nome: string; cargos: string }>).map((r) => ({
        membroId: r.membro_id,
        nome: r.nome,
        cargos: r.cargos,
      }));
    },

    async visitasPorPessoa(companyId, { de, ate }) {
      const { data, error } = await client.rpc("visitas_por_pessoa", {
        p_company_id: companyId,
        p_de: de ?? null,
        p_ate: ate ?? null,
      });
      if (error) throw new AppError("internal_error", "Falha ao contar as visitas por pessoa", error);
      return ((data ?? []) as Array<{ membro_id: string; nome: string; visitas: number }>).map((r) => ({
        membroId: r.membro_id,
        nome: r.nome,
        visitas: Number(r.visitas),
      }));
    },

    async registrarVisita({ visitorId, visitadoEm, membroIds, outros, observacao }) {
      const { error } = await client.rpc("registrar_visita", {
        p_visitor_id: visitorId,
        p_visitado_em: visitadoEm,
        p_membros: membroIds,
        p_outros: outros,
        p_obs: observacao,
      });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Pedido de visita não encontrado.", error);
        if (error.code === "22023") throw new AppError("validation_error", "Informe quem fez a visita.", error);
        if (error.code === "23514") {
          throw new AppError("validation_error", "Uma das pessoas escolhidas não é desta igreja. Atualize a página.", error);
        }
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
        .is("oculto_em", null)
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
