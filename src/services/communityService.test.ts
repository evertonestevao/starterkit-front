import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import type { EventSignup } from "@/types/database";
import {
  createCommunityService,
  groupSignupsByEvent,
  type CommunityRepository,
} from "./communityService";

const COMPANY = "11111111-1111-4111-8111-111111111111";

function makeRepo() {
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
    async countAll(companyId, since) {
      calls.push({ op: "counts", companyId, extra: since });
      return { prayerRequests: 3, eventSignups: 2, visitors: 1, lastWeek: 4 };
    },
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
