import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import { createChurchScheduleService, type ChurchScheduleRepository } from "./churchScheduleService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const IGREJA = "33333333-3333-4333-8333-333333333333";
const AGORA = new Date("2026-09-20T15:00:00Z");

function build() {
  const repo: ChurchScheduleRepository = {
    listCompanySchedule: vi.fn(async () => []),
    listCompanyChurches: vi.fn(async () => [{ id: IGREJA, name: "Igreja Esperança" }]),
    insertItem: vi.fn(async () => "item-1"),
    softDeleteItem: vi.fn(async () => true),
  };
  return { repo, service: createChurchScheduleService(repo, () => AGORA) };
}

const base = { churchId: IGREJA, titulo: "Culto de celebração", descricao: "", local: "", hora: "18:00" };

describe("addItem", () => {
  it("semanal grava o dia e nenhuma data", async () => {
    const { repo, service } = build();

    await service.addItem({ companyId: EMPRESA, role: "admin" }, { ...base, tipo: "semanal", diaSemana: "0", data: "" });

    expect(repo.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "semanal", diaSemana: 0, data: null, hora: "18:00" }),
    );
  });

  it("especial grava a data e nenhum dia da semana", async () => {
    const { repo, service } = build();

    await service.addItem(
      { companyId: EMPRESA, role: "owner" },
      { ...base, titulo: "Santa Ceia", tipo: "especial", diaSemana: "", data: "2026-10-04" },
    );

    expect(repo.insertItem).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "especial", diaSemana: null, data: "2026-10-04" }),
    );
  });

  it("semanal sem dia e especial sem data são recusados", async () => {
    const { repo, service } = build();

    const a = await service
      .addItem({ companyId: EMPRESA, role: "admin" }, { ...base, tipo: "semanal", diaSemana: "", data: "" })
      .catch((e) => e);
    const b = await service
      .addItem({ companyId: EMPRESA, role: "admin" }, { ...base, tipo: "especial", diaSemana: "", data: "" })
      .catch((e) => e);

    expect(isAppError(a) && a.message).toBe("Escolha o dia da semana");
    expect(isAppError(b) && b.message).toBe("Escolha a data");
    expect(repo.insertItem).not.toHaveBeenCalled();
  });

  it("especial com data passada é recusado", async () => {
    const { service } = build();

    const err = await service
      .addItem({ companyId: EMPRESA, role: "admin" }, { ...base, tipo: "especial", diaSemana: "", data: "2026-09-19" })
      .catch((e) => e);

    expect(isAppError(err) && err.message).toBe("A data do culto especial já passou.");
  });

  it("membro comum não mexe na programação", async () => {
    const { repo, service } = build();

    const err = await service
      .addItem({ companyId: EMPRESA, role: "member" }, { ...base, tipo: "semanal", diaSemana: "0", data: "" })
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(repo.insertItem).not.toHaveBeenCalled();
  });
});

describe("removeItem", () => {
  it("remove só dentro da empresa", async () => {
    const { repo, service } = build();
    const ID = "55555555-5555-4555-8555-555555555555";

    await service.removeItem({ companyId: EMPRESA, role: "admin" }, ID);

    expect(repo.softDeleteItem).toHaveBeenCalledWith(EMPRESA, ID);
  });

  it("item de outra igreja (ou inexistente) dá erro claro", async () => {
    const { repo, service } = build();
    vi.mocked(repo.softDeleteItem).mockResolvedValueOnce(false);

    const err = await service
      .removeItem({ companyId: EMPRESA, role: "admin" }, "55555555-5555-4555-8555-555555555555")
      .catch((e) => e);

    expect(isAppError(err) && err.code).toBe("not_found");
  });
});
