import { AppError } from "@/lib/errors";
import type { EventSignup, PrayerRequest, Visitor } from "@/types/database";
import { normalizePageParams, type PageParams, type Paginated } from "./tenantService";

/**
 * O que a comunidade envia pela página pública: pedidos de oração,
 * inscrições em eventos e visitantes.
 *
 * São dados de gente real, e dois deles (oração e contato) são sensíveis —
 * por isso nada aqui agrega entre empresas e todo acesso é filtrado pela
 * empresa ativa, além da RLS.
 */

export interface CommunityCounts {
  prayerRequests: number;
  eventSignups: number;
  visitors: number;
  /** Chegados nos últimos 7 dias, somando os três. */
  lastWeek: number;
}

export interface CommunityRepository {
  listPrayerRequests(
    companyId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: PrayerRequest[]; total: number }>;
  listEventSignups(
    companyId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: EventSignup[]; total: number }>;
  listVisitors(
    companyId: string,
    opts: { limit: number; offset: number },
  ): Promise<{ items: Visitor[]; total: number }>;
  countAll(companyId: string, since: string): Promise<CommunityCounts>;
}

const PAGE_SIZE = 20;

export function createCommunityService(repo: CommunityRepository) {
  function requireCompany(companyId: string): string {
    if (!companyId) {
      throw new AppError("unauthorized", "Selecione uma empresa para continuar.");
    }
    return companyId;
  }

  return {
    async listPrayerRequests(
      companyId: string,
      params?: PageParams,
    ): Promise<Paginated<PrayerRequest>> {
      const { page, pageSize, offset } = normalizePageParams(params, PAGE_SIZE);
      const { items, total } = await repo.listPrayerRequests(requireCompany(companyId), {
        limit: pageSize,
        offset,
      });
      return { items, total, page, pageSize };
    },

    async listEventSignups(
      companyId: string,
      params?: PageParams,
    ): Promise<Paginated<EventSignup>> {
      const { page, pageSize, offset } = normalizePageParams(params, PAGE_SIZE);
      const { items, total } = await repo.listEventSignups(requireCompany(companyId), {
        limit: pageSize,
        offset,
      });
      return { items, total, page, pageSize };
    },

    async listVisitors(companyId: string, params?: PageParams): Promise<Paginated<Visitor>> {
      const { page, pageSize, offset } = normalizePageParams(params, PAGE_SIZE);
      const { items, total } = await repo.listVisitors(requireCompany(companyId), {
        limit: pageSize,
        offset,
      });
      return { items, total, page, pageSize };
    },

    /** Totais para os cartões do topo. `now` injetável para teste. */
    async getCounts(companyId: string, now: Date = new Date()): Promise<CommunityCounts> {
      const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      return repo.countAll(requireCompany(companyId), since);
    },
  };
}

export type CommunityService = ReturnType<typeof createCommunityService>;

/** Agrupa inscrições por evento, para a tela mostrar por evento. */
export function groupSignupsByEvent(
  signups: EventSignup[],
): Array<{ eventName: string; count: number; latestAt: string }> {
  const byEvent = new Map<string, { count: number; latestAt: string }>();

  for (const signup of signups) {
    const current = byEvent.get(signup.event_name);
    if (!current) {
      byEvent.set(signup.event_name, { count: 1, latestAt: signup.created_at });
      continue;
    }
    current.count += 1;
    if (signup.created_at > current.latestAt) current.latestAt = signup.created_at;
  }

  return [...byEvent.entries()]
    .map(([eventName, data]) => ({ eventName, ...data }))
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}
