import { z } from "zod";
import { AppError, toValidationError } from "@/lib/errors";
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
    opts: { limit: number; offset: number; eventId?: string },
  ): Promise<{ items: EventSignup[]; total: number }>;
  listVisitors(
    companyId: string,
    opts: { limit: number; offset: number; situacao?: SituacaoVisita } & PeriodoPedidos,
  ): Promise<{ items: Visitor[]; total: number }>;
  /** Quantos pedidos (do período) esperam visita e quantos já foram visitados. */
  countVisitas(companyId: string, periodo: PeriodoPedidos): Promise<{ pendentes: number; feitas: number }>;
  /** Pela RPC registrar_visita (só a equipe da própria igreja). Data null = desfaz. */
  registrarVisita(input: RegistroVisita): Promise<void>;
  countAll(companyId: string, since: string): Promise<CommunityCounts>;
  /** Até quando a PRÓPRIA sessão já viu os pedidos desta empresa. Null = nunca viu. */
  getPrayerSeenAt(companyId: string): Promise<string | null>;
  countPrayerRequestsSince(companyId: string, since: string | null): Promise<number>;
  /** Marca "vi tudo até este ponto" para o usuário logado (auth.uid() na RPC). */
  markPrayerRequestsSeen(companyId: string, seenAt: string): Promise<void>;
}

export type SituacaoVisita = "pendentes" | "feitas";

/** Período pela data do PEDIDO (dias inteiros, YYYY-MM-DD). Vazio = sem limite. */
export interface PeriodoPedidos {
  de?: string;
  ate?: string;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Só datas bem formadas viram filtro; "de" depois de "ate" é trocado. */
export function normalizarPeriodo(de?: string, ate?: string): PeriodoPedidos {
  let d = de && DATA.test(de) && !Number.isNaN(Date.parse(de)) ? de : undefined;
  let a = ate && DATA.test(ate) && !Number.isNaN(Date.parse(ate)) ? ate : undefined;
  if (d && a && d > a) [d, a] = [a, d];
  return { de: d, ate: a };
}

export interface RegistroVisita {
  visitorId: string;
  visitadoEm: string | null;
  visitadoPor: string | null;
  observacao: string | null;
}

const textoOpcional = (max: number, msg: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : (v ?? null)),
    z.string().trim().max(max, msg).nullable(),
  );

const registroVisitaSchema = z
  .object({
    visitorId: z.uuid("Pedido inválido"),
    visitadoEm: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.iso.date("Data inválida").nullable(),
    ),
    visitadoPor: textoOpcional(120, "Nome muito longo"),
    observacao: textoOpcional(1000, "Observação muito longa"),
  })
  .refine((r) => r.visitadoEm === null || !!r.visitadoPor, {
    message: "Informe quem fez a visita",
    path: ["visitadoPor"],
  });

const PAGE_SIZE = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createCommunityService(repo: CommunityRepository) {
  function requireCompany(companyId: string): string {
    if (!companyId) {
      throw new AppError("unauthorized", "Selecione uma igreja para continuar.");
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
      params?: PageParams & { eventId?: string },
    ): Promise<Paginated<EventSignup>> {
      const { page, pageSize, offset } = normalizePageParams(params, PAGE_SIZE);
      // Filtro vindo da URL: só um uuid bem formado vira filtro; o resto é
      // ignorado (lista tudo) em vez de virar erro de banco.
      const eventId =
        params?.eventId && UUID.test(params.eventId) ? params.eventId : undefined;
      const { items, total } = await repo.listEventSignups(requireCompany(companyId), {
        limit: pageSize,
        offset,
        eventId,
      });
      return { items, total, page, pageSize };
    },

    async listVisitors(
      companyId: string,
      params?: PageParams & { situacao?: string; de?: string; ate?: string },
    ): Promise<Paginated<Visitor>> {
      const { page, pageSize, offset } = normalizePageParams(params, PAGE_SIZE);
      // Filtro da URL: valor desconhecido lista todos.
      const situacao =
        params?.situacao === "pendentes" || params?.situacao === "feitas" ? params.situacao : undefined;
      const { items, total } = await repo.listVisitors(requireCompany(companyId), {
        limit: pageSize,
        offset,
        situacao,
        ...normalizarPeriodo(params?.de, params?.ate),
      });
      return { items, total, page, pageSize };
    },

    async countVisitas(companyId: string, periodo?: { de?: string; ate?: string }) {
      return repo.countVisitas(requireCompany(companyId), normalizarPeriodo(periodo?.de, periodo?.ate));
    },

    /** Marca a visita como feita (data + quem foi) ou desfaz (data vazia). */
    async registrarVisita(input: unknown): Promise<void> {
      const parsed = registroVisitaSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const r = parsed.data;
      await repo.registrarVisita({
        visitorId: r.visitorId,
        visitadoEm: r.visitadoEm,
        visitadoPor: r.visitadoEm ? r.visitadoPor : null,
        observacao: r.observacao,
      });
    },

    /** Totais para os cartões do topo. `now` injetável para teste. */
    async getCounts(companyId: string, now: Date = new Date()): Promise<CommunityCounts> {
      const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      return repo.countAll(requireCompany(companyId), since);
    },

    /** Até quando a própria sessão já viu os pedidos desta empresa. Null = nunca viu. */
    async getPrayerSeenAt(companyId: string): Promise<string | null> {
      return repo.getPrayerSeenAt(requireCompany(companyId));
    },

    /** Badge da sidebar: quantos pedidos chegaram depois da última vez que a pessoa olhou. */
    async getUnseenPrayerCount(companyId: string): Promise<number> {
      const seenAt = await repo.getPrayerSeenAt(requireCompany(companyId));
      return repo.countPrayerRequestsSince(companyId, seenAt);
    },

    /**
     * "Vi tudo até este ponto." `seenUpTo` é o `created_at` do pedido mais
     * recente que a tela mostrou — não o relógio do servidor: um pedido novo
     * chegando entre o carregamento da página e o clique não pode ser
     * marcado como visto por alguém que nunca chegou a lê-lo.
     */
    async markPrayerRequestsSeen(companyId: string, seenUpTo: string): Promise<void> {
      return repo.markPrayerRequestsSeen(requireCompany(companyId), seenUpTo);
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
