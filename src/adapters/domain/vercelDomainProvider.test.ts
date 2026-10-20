import { describe, expect, it } from "vitest";
import { isAppError } from "@/lib/errors";
import { createVercelDomainProvider } from "./vercelDomainProvider";

interface Call {
  url: string;
  method: string;
  auth: string | null;
  body: unknown;
}

/** fetch de mentira: devolve a resposta programada por trecho de URL. */
function makeFetch(
  routes: Array<{ match: string; status: number; body: unknown }>,
  calls: Call[] = [],
): { fetchFn: typeof fetch; calls: Call[] } {
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    const headers = new Headers(init?.headers);
    calls.push({
      url: href,
      method: init?.method ?? "GET",
      auth: headers.get("Authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const route = routes.find((r) => href.includes(r.match));
    if (!route) throw new Error(`rota não programada no teste: ${href}`);
    return new Response(JSON.stringify(route.body), { status: route.status });
  }) as unknown as typeof fetch;

  return { fetchFn, calls };
}

const base = { apiToken: "tok_secreto", projectId: "prj_1" };

describe("createVercelDomainProvider", () => {
  it("adiciona o domínio e devolve o desafio TXT normalizado", async () => {
    const { fetchFn, calls } = makeFetch([
      {
        match: "/v10/projects/prj_1/domains",
        status: 200,
        body: {
          name: "igrejax.com.br",
          verified: false,
          verification: [
            {
              type: "TXT",
              domain: "_vercel.igrejax.com.br",
              value: "vc-domain-verify=abc",
              reason: "pending_domain_verification",
            },
          ],
        },
      },
      { match: "/config", status: 200, body: { misconfigured: true } },
    ]);

    const provider = createVercelDomainProvider({ ...base, fetchFn });
    const state = await provider.addDomain("igrejax.com.br");

    expect(state).toMatchObject({ verified: false, misconfigured: true });
    expect(state.challenges).toEqual([
      {
        type: "TXT",
        domain: "_vercel.igrejax.com.br",
        value: "vc-domain-verify=abc",
        reason: "pending_domain_verification",
      },
    ]);
    expect(calls[0]).toMatchObject({
      method: "POST",
      auth: "Bearer tok_secreto",
      body: { name: "igrejax.com.br" },
    });
  });

  it("considera ativo só quando verificado E com DNS apontado", async () => {
    const { fetchFn } = makeFetch([
      { match: "/v9/projects", status: 200, body: { verified: true, verification: [] } },
      { match: "/config", status: 200, body: { misconfigured: false } },
    ]);

    const state = await createVercelDomainProvider({ ...base, fetchFn }).getDomainState(
      "igrejax.com.br",
    );
    expect(state).toMatchObject({ verified: true, misconfigured: false, challenges: [] });
  });

  it("trata config sem o campo misconfigured como ainda não apontado", async () => {
    const { fetchFn } = makeFetch([
      { match: "/v9/projects", status: 200, body: { verified: true } },
      { match: "/config", status: 200, body: {} },
    ]);

    const state = await createVercelDomainProvider({ ...base, fetchFn }).getDomainState(
      "igrejax.com.br",
    );
    expect(state.misconfigured).toBe(true);
  });

  it("converte domínio já usado em conflict com mensagem acionável", async () => {
    const { fetchFn } = makeFetch([
      {
        match: "/v10/projects",
        status: 409,
        body: { error: { code: "domain_already_in_use", message: "detalhe interno" } },
      },
    ]);

    const provider = createVercelDomainProvider({ ...base, fetchFn });
    await expect(provider.addDomain("igrejax.com.br")).rejects.toSatisfy((err: unknown) => {
      if (!isAppError(err)) return false;
      expect(err.code).toBe("conflict");
      // A mensagem do provedor fica no `internal` (log), não no texto do usuário.
      expect(err.message).not.toContain("detalhe interno");
      return true;
    });
  });

  it("não vaza o token nem o corpo do provedor na mensagem de erro", async () => {
    const { fetchFn } = makeFetch([
      {
        match: "/v10/projects",
        status: 500,
        body: { error: { code: "internal", message: "stack trace da vercel" } },
      },
    ]);

    const provider = createVercelDomainProvider({ ...base, fetchFn });
    await expect(provider.addDomain("igrejax.com.br")).rejects.toSatisfy((err: unknown) => {
      if (!isAppError(err)) return false;
      expect(err.code).toBe("domain_error");
      expect(err.message).not.toContain("stack trace da vercel");
      expect(err.message).not.toContain("tok_secreto");
      return true;
    });
  });

  it("propaga teamId em toda chamada quando o projeto é de um time", async () => {
    const { fetchFn, calls } = makeFetch([
      { match: "/v9/projects", status: 200, body: { verified: true } },
      { match: "/config", status: 200, body: { misconfigured: false } },
    ]);

    await createVercelDomainProvider({ ...base, teamId: "team_9", fetchFn }).getDomainState(
      "igrejax.com.br",
    );
    expect(calls.every((call) => call.url.includes("teamId=team_9"))).toBe(true);
  });

  it("tolera 400 no verify: desafio pendente é estado, não falha", async () => {
    const { fetchFn } = makeFetch([
      { match: "/verify", status: 400, body: { error: { code: "verification_failed" } } },
      { match: "/v9/projects", status: 200, body: { verified: false, verification: [] } },
      { match: "/config", status: 200, body: { misconfigured: true } },
    ]);

    const state = await createVercelDomainProvider({ ...base, fetchFn }).verifyDomain(
      "igrejax.com.br",
    );
    expect(state.verified).toBe(false);
  });

  it("tolera 404 ao remover domínio que já não existe", async () => {
    const { fetchFn } = makeFetch([
      { match: "/v9/projects", status: 404, body: { error: { code: "not_found" } } },
    ]);

    await expect(
      createVercelDomainProvider({ ...base, fetchFn }).removeDomain("igrejax.com.br"),
    ).resolves.toBeUndefined();
  });

  it("transforma queda de rede em erro neutro para o usuário", async () => {
    const fetchFn = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    await expect(
      createVercelDomainProvider({ ...base, fetchFn }).getDomainState("igrejax.com.br"),
    ).rejects.toSatisfy((err: unknown) => isAppError(err) && err.code === "domain_error");
  });
});
