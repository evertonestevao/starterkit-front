import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import type { EventSignup } from "@/types/database";
import {
  createCommunityService,
  situacaoDoPedido,
  groupSignupsByEvent,
  type CommunityRepository,
} from "./communityService";

const COMPANY = "11111111-1111-4111-8111-111111111111";

function makeRepo(overrides: Partial<CommunityRepository> = {}) {
  const calls: Array<{ op: string; companyId: string; extra?: unknown }> = [];
  const repo: CommunityRepository = {
    async listPrayerRequests(companyId, opts) {
      calls.push({ op: "prayers", companyId, extra: opts });
      return { items: [], total: 42 };
    },
    async listEventSignups(companyId, opts) {
      calls.push({ op: "signups", companyId, extra: opts });
      return { items: [], total: 0 };
    },
    async listVisitors(companyId, opts) {
      calls.push({ op: "visitors", companyId, extra: opts });
      return { items: [], total: 0 };
    },
    async countVisitas(companyId, periodo) {
      calls.push({ op: "countVisitas", companyId, extra: periodo });
      return { novos: 1, andamento: 1, feitas: 1 };
    },
    async registrarVisita(input) {
      calls.push({ op: "registrarVisita", companyId: "", extra: input });
    },
    async countOracoes() {
      return { pendentes: 2, orados: 5 };
    },
    async marcarOrados(companyId, ids, orado) {
      calls.push({ op: "marcarOrados", companyId, extra: { ids, orado } });
      return ids === null ? 2 : ids.length;
    },
    async anotarPedido(id, texto) {
      calls.push({ op: "anotarPedido", companyId: "", extra: { id, texto } });
    },
    async ocultarPedidoOracao(id) {
      calls.push({ op: "ocultarOracao", companyId: "", extra: id });
    },
    async ocultarPedidoVisita(id) {
      calls.push({ op: "ocultarVisita", companyId: "", extra: id });
    },
    async registrarContato(input) {
      calls.push({ op: "registrarContato", companyId: "", extra: input });
    },
    async listQuemPodeVisitar() {
      return [];
    },
    async visitasPorPessoa() {
      return [];
    },
    async countAll(companyId, since) {
      calls.push({ op: "counts", companyId, extra: since });
      return { prayerRequests: 3, eventSignups: 2, visitors: 1, lastWeek: 4 };
    },
    async getPrayerSeenAt(companyId) {
      calls.push({ op: "seenAt", companyId });
      return null;
    },
    async countPrayerRequestsSince(companyId, since) {
      calls.push({ op: "unseenCount", companyId, extra: since });
      return 0;
    },
    async markPrayerRequestsSeen(companyId, seenAt) {
      calls.push({ op: "markSeen", companyId, extra: seenAt });
    },
    ...overrides,
  };
  return { repo, calls };
}

describe("communityService", () => {
  it("pagina no padrão do projeto (20 por página) e devolve o total", async () => {
    const { repo, calls } = makeRepo();
    const page = await createCommunityService(repo).listPrayerRequests(COMPANY, { page: 2 });

    expect(page).toMatchObject({ total: 42, page: 2, pageSize: 20 });
    expect(calls[0].extra).toEqual({ limit: 20, offset: 20 });
  });

  it("página inválida não quebra nem vaza offset negativo", async () => {
    const { repo, calls } = makeRepo();
    await createCommunityService(repo).listVisitors(COMPANY, { page: -3 });
    expect(calls[0].extra).toEqual({ limit: 20, offset: 0 });
  });

  it("exige empresa ativa — sem ela, nada é consultado", async () => {
    const { repo, calls } = makeRepo();
    await expect(createCommunityService(repo).listEventSignups("")).rejects.toSatisfy(
      (err: unknown) => isAppError(err) && err.code === "unauthorized",
    );
    expect(calls).toHaveLength(0);
  });

  it("conta os últimos 7 dias a partir de agora", async () => {
    const { repo, calls } = makeRepo();
    const now = new Date("2026-09-17T12:00:00.000Z");
    const counts = await createCommunityService(repo).getCounts(COMPANY, now);

    expect(counts).toMatchObject({ prayerRequests: 3, lastWeek: 4 });
    expect(calls[0].extra).toBe("2026-09-10T12:00:00.000Z");
  });

  it("nunca viu: o badge conta TODOS os pedidos, não só os recentes", async () => {
    const { repo } = makeRepo({
      async getPrayerSeenAt() {
        return null;
      },
      async countPrayerRequestsSince(_companyId, since) {
        // O repositório é quem decide "todos" quando since é null — o
        // service só precisa repassar o null adiante, não fabricar uma data.
        return since === null ? 7 : 0;
      },
    });

    const total = await createCommunityService(repo).getUnseenPrayerCount(COMPANY);

    expect(total).toBe(7);
  });

  it("já viu: o badge conta só o que chegou depois da marca", async () => {
    // O "999" no ramo errado é a prova: se o service passasse qualquer coisa
    // diferente da marca (ex.: null, ou esquecesse de repassar), o resultado
    // sairia 999, não 2.
    const { repo } = makeRepo({
      async getPrayerSeenAt() {
        return "2026-09-01T00:00:00.000Z";
      },
      async countPrayerRequestsSince(_companyId, since) {
        return since === "2026-09-01T00:00:00.000Z" ? 2 : 999;
      },
    });

    const total = await createCommunityService(repo).getUnseenPrayerCount(COMPANY);

    expect(total).toBe(2);
  });

  it("marcar como visto repassa o companyId e o ponto exato informado", async () => {
    const { repo, calls } = makeRepo();

    await createCommunityService(repo).markPrayerRequestsSeen(COMPANY, "2026-09-20T10:00:00.000Z");

    expect(calls).toEqual([
      { op: "markSeen", companyId: COMPANY, extra: "2026-09-20T10:00:00.000Z" },
    ]);
  });

  it("sem empresa ativa, nem o badge nem a marca de visto tocam o repositório", async () => {
    const { repo, calls } = makeRepo();
    const service = createCommunityService(repo);

    await expect(service.getUnseenPrayerCount("")).rejects.toSatisfy(
      (err: unknown) => isAppError(err) && err.code === "unauthorized",
    );
    await expect(service.markPrayerRequestsSeen("", "2026-09-20T10:00:00.000Z")).rejects.toSatisfy(
      (err: unknown) => isAppError(err) && err.code === "unauthorized",
    );
    expect(calls).toHaveLength(0);
  });
});

describe("groupSignupsByEvent", () => {
  const signup = (event: string, at: string): EventSignup => ({
    id: `${event}-${at}`,
    church_id: "c",
    company_id: COMPANY,
    event_name: event,
    person_name: "Alguém",
    contact: "11999999999",
    created_at: at,
  });

  it("agrupa por evento e ordena pelo mais recente", () => {
    const result = groupSignupsByEvent([
      signup("Culto de jovens", "2026-09-01T10:00:00Z"),
      signup("Retiro", "2026-09-10T10:00:00Z"),
      signup("Culto de jovens", "2026-09-12T10:00:00Z"),
    ]);

    expect(result).toEqual([
      { eventName: "Culto de jovens", count: 2, latestAt: "2026-09-12T10:00:00Z" },
      { eventName: "Retiro", count: 1, latestAt: "2026-09-10T10:00:00Z" },
    ]);
  });

  it("lista vazia não quebra", () => {
    expect(groupSignupsByEvent([])).toEqual([]);
  });
});

describe("registrarVisita", () => {
  const ID = "22222222-2222-4222-8222-222222222222";
  const MEMBRO = "33333333-3333-4333-8333-333333333333";

  it("visita feita exige quem visitou: um membro ou um nome em texto", async () => {
    const { repo, calls } = makeRepo();
    const err = await createCommunityService(repo)
      .registrarVisita({ visitorId: ID, visitadoEm: "2026-10-01", membroIds: [], outros: " ", observacao: "" })
      .catch((e) => e);
    expect(isAppError(err) && err.message).toBe("Informe quem fez a visita");
    expect(calls).toHaveLength(0);
  });

  it("aceita membros (sem repetir) e/ou outras pessoas em texto", async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    await svc.registrarVisita({ visitorId: ID, visitadoEm: "2026-10-01", membroIds: [MEMBRO, MEMBRO], outros: "", observacao: " ok " });
    await svc.registrarVisita({ visitorId: ID, visitadoEm: "2026-10-01", outros: "Irmã de outra igreja" });
    expect(calls.map((c) => c.extra)).toEqual([
      { visitorId: ID, visitadoEm: "2026-10-01", membroIds: [MEMBRO], outros: null, observacao: "ok" },
      { visitorId: ID, visitadoEm: "2026-10-01", membroIds: [], outros: "Irmã de outra igreja", observacao: null },
    ]);
  });

  it("desfazer (sem data) limpa quem visitou", async () => {
    const { repo, calls } = makeRepo();
    await createCommunityService(repo).registrarVisita({
      visitorId: ID,
      visitadoEm: "",
      membroIds: [MEMBRO],
      outros: "Pr. João",
      observacao: "x",
    });
    expect(calls[0].extra).toEqual({ visitorId: ID, visitadoEm: null, membroIds: [], outros: null, observacao: null });
  });

  it("contato feito: guarda o dia combinado (opcional); desfazer limpa", async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    await svc.registrarContato({ visitorId: ID, agendadaPara: "2026-10-08", observacao: " quinta à tarde " });
    await svc.registrarContato({ visitorId: ID, agendadaPara: "", observacao: "" });
    await svc.registrarContato({ visitorId: ID, agendadaPara: "2026-10-08", observacao: "x", desfazer: true });
    expect(calls.map((c) => c.extra)).toEqual([
      { visitorId: ID, agendadaPara: "2026-10-08", observacao: "quinta à tarde", desfazer: false },
      { visitorId: ID, agendadaPara: null, observacao: null, desfazer: false },
      { visitorId: ID, agendadaPara: null, observacao: null, desfazer: true },
    ]);
    const err = await svc.registrarContato({ visitorId: ID, agendadaPara: "amanhã" }).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("validation_error");
  });

  it("filtro de situação: as três etapas valem; desconhecido lista todos", async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    await svc.listVisitors(COMPANY, { situacao: "andamento" });
    await svc.listVisitors(COMPANY, { situacao: "xpto" });
    expect(calls.map((c) => (c.extra as { situacao?: string }).situacao)).toEqual(["andamento", undefined]);
  });

  it("etapa do pedido pelas datas", () => {
    expect(situacaoDoPedido({ visitado_em: null, contato_em: null })).toBe("novos");
    expect(situacaoDoPedido({ visitado_em: null, contato_em: "2026-10-01" })).toBe("andamento");
    expect(situacaoDoPedido({ visitado_em: "2026-10-03", contato_em: "2026-10-01" })).toBe("feitas");
  });
});

describe("pedidos de oração: estado", () => {
  const P1 = "44444444-4444-4444-8444-444444444444";

  it("marca um pedido (sem repetir ids) e desfaz", async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    await svc.marcarOrados(COMPANY, [P1, P1], true);
    await svc.marcarOrados(COMPANY, [P1], false);
    expect(calls.map((c) => c.extra)).toEqual([
      { ids: [P1], orado: true },
      { ids: [P1], orado: false },
    ]);
  });

  it('"todos" marca os pendentes de uma vez, mas não desfaz em massa', async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    await expect(svc.marcarOrados(COMPANY, "todos", true)).resolves.toBe(2);
    expect(calls[0].extra).toEqual({ ids: null, orado: true });
    const err = await svc.marcarOrados(COMPANY, "todos", false).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(calls).toHaveLength(1);
  });

  it("recusa id inválido e lista vazia", async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    for (const ids of [[], ["xpto"], "outra-coisa"]) {
      const err = await svc.marcarOrados(COMPANY, ids, true).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(calls).toHaveLength(0);
  });

  it("anotação: guarda aparada, vazia apaga, longa demais é recusada", async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    await svc.anotarPedido(P1, "  ligar na sexta  ");
    await svc.anotarPedido(P1, "   ");
    expect(calls.map((c) => c.extra)).toEqual([
      { id: P1, texto: "ligar na sexta" },
      { id: P1, texto: null },
    ]);
    const err = await svc.anotarPedido(P1, "x".repeat(501)).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("validation_error");
  });

  it("filtro de situação: pendentes e orados valem; desconhecido lista todos", async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    await svc.listPrayerRequests(COMPANY, { situacao: "orados" });
    await svc.listPrayerRequests(COMPANY, { situacao: "xpto" });
    expect(calls.map((c) => (c.extra as { situacao?: string }).situacao)).toEqual(["orados", undefined]);
  });
});

describe("ocultar pedido", () => {
  const P1 = "55555555-5555-4555-8555-555555555555";

  it("vai para o tipo certo e recusa id inválido", async () => {
    const { repo, calls } = makeRepo();
    const svc = createCommunityService(repo);
    await svc.ocultarPedido("oracao", P1);
    await svc.ocultarPedido("visita", P1);
    expect(calls.map((c) => c.op)).toEqual(["ocultarOracao", "ocultarVisita"]);
    const err = await svc.ocultarPedido("oracao", "xpto").catch((e) => e);
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(calls).toHaveLength(2);
  });
});

describe("normalizarPeriodo", () => {
  it("ignora data malformada e troca de/até invertidos", async () => {
    const { normalizarPeriodo } = await import("./communityService");
    expect(normalizarPeriodo("2026-13-45", "x")).toEqual({ de: undefined, ate: undefined });
    expect(normalizarPeriodo("2026-10-01", "2026-09-01")).toEqual({ de: "2026-09-01", ate: "2026-10-01" });
  });
});
