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
    opts: { limit: number; offset: number; situacao?: SituacaoOracao },
  ): Promise<{ items: PrayerRequest[]; total: number }>;
  /** Quantos pedidos aguardam oração e quantos já foram orados. */
  countOracoes(companyId: string): Promise<{ pendentes: number; orados: number }>;
  /** RPC marcar_pedidos_orados. ids null = todos os pendentes. Devolve quantos mudaram. */
  marcarOrados(companyId: string, ids: string[] | null, orado: boolean): Promise<number>;
  /** RPC anotar_pedido_oracao (texto null apaga a anotação). */
  anotarPedido(id: string, texto: string | null): Promise<void>;
  /** RPC ocultar_pedido_oracao: tira da tela um pedido ofensivo ou de spam. */
  ocultarPedidoOracao(id: string): Promise<void>;
  /** RPC ocultar_pedido_visita: idem para o pedido de visita. */
  ocultarPedidoVisita(id: string): Promise<void>;
  listEventSignups(
    companyId: string,
    opts: { limit: number; offset: number; eventId?: string },
  ): Promise<{ items: EventSignup[]; total: number }>;
  listVisitors(
    companyId: string,
    opts: { limit: number; offset: number; situacao?: SituacaoVisita } & PeriodoPedidos,
  ): Promise<{ items: Visitor[]; total: number }>;
  /** Quantos pedidos (do período) em cada etapa: sem contato, com contato feito, visitados. */
  countVisitas(companyId: string, periodo: PeriodoPedidos): Promise<ContagemVisitas>;
  /** Pela RPC registrar_visita (só a equipe da própria igreja). Data null = desfaz. */
  registrarVisita(input: RegistroVisita): Promise<void>;
  /** Pela RPC registrar_contato_visita. `desfazer` volta para "aguardando contato". */
  registrarContato(input: RegistroContatoVisita): Promise<void>;
  /** Membros com cargo que podem ser marcados como quem visitou (só nome e cargos). */
  listQuemPodeVisitar(companyId: string): Promise<PessoaQueVisita[]>;
  /** Visitas feitas por membro, pela data da visita. */
  visitasPorPessoa(companyId: string, periodo: PeriodoPedidos): Promise<VisitasDaPessoa[]>;
  countAll(companyId: string, since: string): Promise<CommunityCounts>;
  /** Até quando a PRÓPRIA sessão já viu os pedidos desta empresa. Null = nunca viu. */
  getPrayerSeenAt(companyId: string): Promise<string | null>;
  countPrayerRequestsSince(companyId: string, since: string | null): Promise<number>;
  /** Marca "vi tudo até este ponto" para o usuário logado (auth.uid() na RPC). */
  markPrayerRequestsSeen(companyId: string, seenAt: string): Promise<void>;
}

export type SituacaoOracao = "pendentes" | "orados";

/** Etapas do pedido: sem contato → contato feito (em andamento) → visitado. */
export type SituacaoVisita = "novos" | "andamento" | "feitas";

export interface ContagemVisitas {
  /** Ninguém falou com a pessoa ainda. */
  novos: number;
  /** Contato feito, visita ainda não aconteceu. */
  andamento: number;
  feitas: number;
}

export interface PessoaQueVisita {
  membroId: string;
  nome: string;
  cargos: string;
}

export interface VisitasDaPessoa {
  membroId: string;
  nome: string;
  visitas: number;
}

/** Em que etapa o pedido está, pelas datas gravadas. */
export function situacaoDoPedido(v: Pick<Visitor, "visitado_em" | "contato_em">): SituacaoVisita {
  if (v.visitado_em) return "feitas";
  return v.contato_em ? "andamento" : "novos";
}

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
  /** Membros da igreja que foram (para a contagem por pessoa). */
  membroIds: string[];
  /** Quem foi e não é membro cadastrado (texto livre). */
  outros: string | null;
  observacao: string | null;
}

export interface RegistroContatoVisita {
  visitorId: string;
  /** Dia combinado para a visita; null = ainda sem data. */
  agendadaPara: string | null;
  observacao: string | null;
  desfazer: boolean;
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
    membroIds: z.array(z.uuid("Pessoa inválida")).max(20, "Gente demais na visita").default([]),
    outros: textoOpcional(120, "Texto muito longo"),
    observacao: textoOpcional(1000, "Observação muito longa"),
  })
  .refine((r) => r.visitadoEm === null || r.membroIds.length > 0 || !!r.outros, {
    message: "Informe quem fez a visita",
    path: ["membroIds"],
  });

const dataOpcional = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.iso.date("Data inválida").nullable(),
);

const registroContatoSchema = z.object({
  visitorId: z.uuid("Pedido inválido"),
  agendadaPara: dataOpcional,
  observacao: textoOpcional(500, "Observação muito longa"),
  desfazer: z.boolean().default(false),
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
      params?: PageParams & { situacao?: string },
    ): Promise<Paginated<PrayerRequest>> {
      const { page, pageSize, offset } = normalizePageParams(params, PAGE_SIZE);
      // Filtro da URL: valor desconhecido lista todos.
      const situacao = params?.situacao === "pendentes" || params?.situacao === "orados" ? params.situacao : undefined;
      const { items, total } = await repo.listPrayerRequests(requireCompany(companyId), {
        limit: pageSize,
        offset,
        situacao,
      });
      return { items, total, page, pageSize };
    },

    async countOracoes(companyId: string): Promise<{ pendentes: number; orados: number }> {
      return repo.countOracoes(requireCompany(companyId));
    },

    /**
     * Marca pedidos como "já oramos" (ou desfaz). `ids` = "todos" marca todos
     * os que aguardam — como depois de um culto de oração. Quem pode é
     * decidido no banco (só quem administra a própria igreja).
     */
    async marcarOrados(companyId: string, ids: unknown, orado: boolean): Promise<number> {
      const empresa = requireCompany(companyId);
      if (ids === "todos") {
        // "Todos" só existe para marcar: desfazer em massa apagaria o histórico inteiro.
        if (!orado) throw new AppError("validation_error", "Desfaça um pedido por vez.");
        return repo.marcarOrados(empresa, null, true);
      }
      const parsed = z.array(z.uuid("Pedido inválido")).min(1, "Escolha um pedido").max(500).safeParse(ids);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      return repo.marcarOrados(empresa, [...new Set(parsed.data)], orado);
    },

    /**
     * Tira da tela um pedido ofensivo ou de spam ("oracao" ou "visita"). Não
     * volta pela tela; o registro continua no banco. Quem pode é decidido lá.
     */
    async ocultarPedido(tipo: "oracao" | "visita", id: unknown): Promise<void> {
      const parsed = z.uuid("Pedido inválido").safeParse(id);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      if (tipo === "oracao") await repo.ocultarPedidoOracao(parsed.data);
      else await repo.ocultarPedidoVisita(parsed.data);
    },

    /** Anotação da liderança no pedido (vazia apaga). */
    async anotarPedido(id: unknown, texto: unknown): Promise<void> {
      const parsed = z
        .object({ id: z.uuid("Pedido inválido"), texto: textoOpcional(500, "Anotação muito longa") })
        .safeParse({ id, texto });
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      await repo.anotarPedido(parsed.data.id, parsed.data.texto);
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
        params?.situacao === "novos" || params?.situacao === "andamento" || params?.situacao === "feitas"
          ? params.situacao
          : undefined;
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
        // Desfazer (sem data) limpa tudo.
        membroIds: r.visitadoEm ? [...new Set(r.membroIds)] : [],
        outros: r.visitadoEm ? r.outros : null,
        observacao: r.visitadoEm ? r.observacao : null,
      });
    },

    /** Registra que a equipe já falou com a pessoa (e o dia combinado, se houver), ou desfaz. */
    async registrarContato(input: unknown): Promise<void> {
      const parsed = registroContatoSchema.safeParse(input);
      if (!parsed.success) throw toValidationError(parsed.error.issues);
      const r = parsed.data;
      await repo.registrarContato({
        visitorId: r.visitorId,
        agendadaPara: r.desfazer ? null : r.agendadaPara,
        observacao: r.desfazer ? null : r.observacao,
        desfazer: r.desfazer,
      });
    },

    /** Quem pode ser marcado como visitante (membros com cargo). */
    async quemPodeVisitar(companyId: string): Promise<PessoaQueVisita[]> {
      return repo.listQuemPodeVisitar(requireCompany(companyId));
    },

    /** Quantas visitas cada membro fez no período (pela data da visita). */
    async visitasPorPessoa(companyId: string, periodo?: { de?: string; ate?: string }): Promise<VisitasDaPessoa[]> {
      return repo.visitasPorPessoa(requireCompany(companyId), normalizarPeriodo(periodo?.de, periodo?.ate));
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
