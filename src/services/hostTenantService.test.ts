import { describe, expect, it, vi } from "vitest";
import { createHostTenantService, type HostTenantMatch } from "./hostTenantService";

const PRIMARY = "tagigreja.com.br";
const MATCH: HostTenantMatch = { churchId: "abc", publicCode: "igreja-x" };

function makeService(options: {
  lookup?: (host: string) => Promise<HostTenantMatch | null>;
  clock?: { value: number };
} = {}) {
  const calls: string[] = [];
  const clock = options.clock ?? { value: 0 };
  const service = createHostTenantService({
    primaryHost: PRIMARY,
    now: () => clock.value,
    lookup: async (host) => {
      calls.push(host);
      return options.lookup ? options.lookup(host) : MATCH;
    },
  });
  return { service, calls, clock };
}

describe("hostTenantService.resolve", () => {
  it("resolve host customizado cadastrado", async () => {
    const { service, calls } = makeService();
    await expect(service.resolve("igrejax.com.br")).resolves.toEqual(MATCH);
    expect(calls).toEqual(["igrejax.com.br"]);
  });

  it("normaliza porta e maiúsculas antes de consultar", async () => {
    const { service, calls } = makeService();
    await service.resolve("IgrejaX.com.br:3000");
    expect(calls).toEqual(["igrejax.com.br"]);
  });

  it("não consulta nada para host da plataforma", async () => {
    const { service, calls } = makeService();
    for (const host of [
      PRIMARY,
      `app.${PRIMARY}`,
      "localhost:3000",
      "preview.vercel.app",
      "127.0.0.1",
      "",
      null,
    ]) {
      await expect(service.resolve(host)).resolves.toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it("cacheia acerto e erro dentro do TTL e reconsulta depois", async () => {
    const clock = { value: 1_000 };
    const { service, calls } = makeService({ clock });

    await service.resolve("igrejax.com.br");
    await service.resolve("igrejax.com.br");
    expect(calls).toHaveLength(1);

    clock.value += 61_000;
    await service.resolve("igrejax.com.br");
    expect(calls).toHaveLength(2);
  });

  it("cacheia o negativo para não virar amplificador de consulta", async () => {
    const { service, calls } = makeService({ lookup: async () => null });
    await service.resolve("desconhecido.com.br");
    await service.resolve("desconhecido.com.br");
    expect(calls).toHaveLength(1);
  });

  it("falha aberto: lookup quebrado não propaga erro", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { service } = makeService({
      lookup: async () => {
        throw new Error("supabase fora do ar");
      },
    });

    // O acesso pelo endereço padrão não pode depender deste caminho.
    await expect(service.resolve("igrejax.com.br")).resolves.toBeNull();
    warn.mockRestore();
  });

  it("não cacheia falha: a próxima request tenta de novo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let falhar = true;
    const { service } = makeService({
      lookup: async () => {
        if (falhar) throw new Error("instabilidade");
        return MATCH;
      },
    });

    await expect(service.resolve("igrejax.com.br")).resolves.toBeNull();
    falhar = false;
    await expect(service.resolve("igrejax.com.br")).resolves.toEqual(MATCH);
    warn.mockRestore();
  });
});
