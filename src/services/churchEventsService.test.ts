import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import { createChurchEventsService, type ChurchEventsRepository } from "./churchEventsService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const IGREJA = "33333333-3333-4333-8333-333333333333";
const IGREJA_DE_OUTRA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-20T12:00:00Z");

function build() {
  const repo: ChurchEventsRepository = {
    listCompanyEvents: vi.fn(async () => []),
    listCompanyChurches: vi.fn(async () => [{ id: IGREJA, name: "Igreja Esperança", address: null }]),
    insertEvent: vi.fn(async () => "evento-1"),
    updateEvent: vi.fn(async () => true),
    softDeleteEvent: vi.fn(async () => true),
  };
  return { repo, service: createChurchEventsService(repo, () => AGORA) };
}

const valido = {
  churchId: IGREJA,
  titulo: "Retiro de Jovens",
  descricao: "",
  inicio: "2026-10-17T08:00",
  fim: "2026-10-18T17:00",
  local: "",
  preco: "180,00",
  inscricoesAbertas: true,
};

describe("createEvent", () => {
  it("grava com horário de Brasília convertido e preço em centavos", async () => {
    const { repo, service } = build();

    const id = await service.createEvent({ companyId: EMPRESA, role: "owner" }, valido);

    expect(id).toBe("evento-1");
    expect(repo.insertEvent).toHaveBeenCalledWith({
      churchId: IGREJA,
      titulo: "Retiro de Jovens",
      descricao: null,
      inicio: "2026-10-17T11:00:00.000Z",
      fim: "2026-10-18T20:00:00.000Z",
      local: null,
      precoCents: 18000,
      inscricoesAbertas: true,
    });
  });

  it("membro comum não publica evento", async () => {
    const { repo, service } = build();

    const err = await service.createEvent({ companyId: EMPRESA, role: "member" }, valido).catch((e) => e);

    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("igreja que não é da empresa ativa não recebe evento, mesmo vindo no formulário", async () => {
    const { repo, service } = build();

    const err = await service
      .createEvent({ companyId: EMPRESA, role: "admin" }, { ...valido, churchId: IGREJA_DE_OUTRA })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("evento no passado é recusado", async () => {
    const { service } = build();

    const err = await service
      .createEvent({ companyId: EMPRESA, role: "admin" }, { ...valido, inicio: "2026-09-01T19:00", fim: "" })
      .catch((e) => e);

    expect(isAppError(err) && err.message).toBe("O evento precisa começar no futuro.");
  });

  it("término antes do início é recusado", async () => {
    const { service } = build();

    const err = await service
      .createEvent({ companyId: EMPRESA, role: "admin" }, { ...valido, fim: "2026-10-16T08:00" })
      .catch((e) => e);

    expect(isAppError(err) && err.message).toBe("O término não pode ser antes do início.");
  });

  it("preço ilegível é recusado em vez de virar gratuito por engano", async () => {
    const { repo, service } = build();

    const err = await service
      .createEvent({ companyId: EMPRESA, role: "admin" }, { ...valido, preco: "cento e oitenta" })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("preço em branco é gratuito", async () => {
    const { repo, service } = build();

    await service.createEvent({ companyId: EMPRESA, role: "admin" }, { ...valido, preco: "" });

    expect(repo.insertEvent).toHaveBeenCalledWith(expect.objectContaining({ precoCents: 0 }));
  });
});

describe("getAgenda", () => {
  it("separa próximos (mais perto primeiro) de anteriores (mais recente primeiro)", async () => {
    const { repo, service } = build();
    const evento = (id: string, inicio: string) => ({
      id, churchId: IGREJA, churchName: "Igreja", titulo: id, descricao: null, inicio, fim: null,
      local: null, precoCents: 0, inscricoesAbertas: true, inscritos: 0,
    });
    vi.mocked(repo.listCompanyEvents).mockResolvedValueOnce([
      evento("antigo", "2026-08-01T12:00:00Z"),
      evento("recente", "2026-09-10T12:00:00Z"),
      evento("logo", "2026-09-27T12:00:00Z"),
      evento("depois", "2026-10-17T12:00:00Z"),
    ]);

    const { proximos, anteriores } = await service.getAgenda(EMPRESA);

    expect(proximos.map((e) => e.id)).toEqual(["logo", "depois"]);
    expect(anteriores.map((e) => e.id)).toEqual(["recente", "antigo"]);
  });
});


describe("updateEvent e removeEvent", () => {
  it("edita um evento que já começou: corrigir a data é justamente o caso", async () => {
    const { repo, service } = build();

    await service.updateEvent(
      { companyId: EMPRESA, role: "admin" },
      {
        eventId: "99999999-9999-4999-8999-999999999999",
        titulo: "Encontro de casais",
        descricao: "",
        inicio: "2026-09-01T19:00",
        fim: "",
        local: "",
        preco: "120,00",
        inscricoesAbertas: true,
      },
    );

    expect(repo.updateEvent).toHaveBeenCalledWith(
      EMPRESA,
      "99999999-9999-4999-8999-999999999999",
      expect.objectContaining({ precoCents: 12000, inscricoesAbertas: true }),
    );
  });

  it("recusa término antes do início", async () => {
    const { repo, service } = build();

    await expect(
      service.updateEvent(
        { companyId: EMPRESA, role: "admin" },
        {
          eventId: "99999999-9999-4999-8999-999999999999",
          titulo: "Retiro",
          descricao: "",
          inicio: "2026-10-10T19:00",
          fim: "2026-10-09T19:00",
          local: "",
          preco: "0",
          inscricoesAbertas: true,
        },
      ),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(repo.updateEvent).not.toHaveBeenCalled();
  });

  it("member não remove evento", async () => {
    const { repo, service } = build();

    await expect(
      service.removeEvent({ companyId: EMPRESA, role: "member" }, "99999999-9999-4999-8999-999999999999"),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(repo.softDeleteEvent).not.toHaveBeenCalled();
  });

  it("evento de outra empresa não é removido", async () => {
    const { repo, service } = build();
    (repo.softDeleteEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    await expect(
      service.removeEvent({ companyId: EMPRESA, role: "owner" }, "99999999-9999-4999-8999-999999999999"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
