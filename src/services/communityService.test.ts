import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import type { EventSignup } from "@/types/database";
import {
  createCommunityService,
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
      return { pendentes: 2, feitas: 1 };
    },
    async registrarVisita(input) {
      calls.push({ op: "registrarVisita", companyId: "", extra: input });
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

  it("visita feita exige quem visitou", async () => {
    const { repo, calls } = makeRepo();
    const err = await createCommunityService(repo)
      .registrarVisita({ visitorId: ID, visitadoEm: "2026-10-01", visitadoPor: " ", observacao: "" })
      .catch((e) => e);
    expect(isAppError(err) && err.message).toBe("Informe quem fez a visita");
    expect(calls).toHaveLength(0);
  });

  it("desfazer (sem data) limpa quem visitou", async () => {
    const { repo, calls } = makeRepo();
    await createCommunityService(repo).registrarVisita({
      visitorId: ID,
      visitadoEm: "",
      visitadoPor: "Pr. João",
      observacao: "",
    });
    expect(calls[0].extra).toEqual({ visitorId: ID, visitadoEm: null, visitadoPor: null, observacao: null });
  });

  it("filtro de situação desconhecido lista todos", async () => {
    const { repo, calls } = makeRepo();
    await createCommunityService(repo).listVisitors(COMPANY, { situacao: "xpto" });
    expect(calls[0].extra).toMatchObject({ situacao: undefined });
  });
});

describe("normalizarPeriodo", () => {
  it("ignora data malformada e troca de/até invertidos", async () => {
    const { normalizarPeriodo } = await import("./communityService");
    expect(normalizarPeriodo("2026-13-45", "x")).toEqual({ de: undefined, ate: undefined });
    expect(normalizarPeriodo("2026-10-01", "2026-09-01")).toEqual({ de: "2026-09-01", ate: "2026-10-01" });
  });
});
