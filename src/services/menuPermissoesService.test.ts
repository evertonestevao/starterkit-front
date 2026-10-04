import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import type { LinhaAcesso } from "@/lib/menuPermissoes";
import { createMenuPermissoesService, type MenuPermissoesRepository } from "./menuPermissoesService";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const SECRETARIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DE_OUTRA_REDE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function build(linhas: LinhaAcesso[] = []) {
  const repo: MenuPermissoesRepository = {
    listarDaRede: vi.fn(async () => linhas),
    listarCargos: vi.fn(async () => [{ id: SECRETARIO, nome: "Secretário(a)" }]),
    salvar: vi.fn(async () => {}),
  };
  return { repo, service: createMenuPermissoesService(repo) };
}

describe("menuPermissoesService", () => {
  it("só o responsável altera ou vê a configuração", async () => {
    const { repo, service } = build();
    for (const role of ["admin", "member"] as const) {
      const err = await service.salvar({ companyId: COMPANY, role }, []).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("forbidden");
      const ver = await service.matriz({ companyId: COMPANY, role }).catch((e) => e);
      expect(isAppError(ver) && ver.code).toBe("forbidden");
    }
    expect(repo.salvar).not.toHaveBeenCalled();
    expect(repo.listarDaRede).not.toHaveBeenCalled();
  });

  it("grava a configuração inteira da igreja e descarta cargo que ela não usa", async () => {
    // A sede liberou a EBD para o Secretário; esta igreja já tinha tirado.
    const { repo, service } = build([
      { cargo_id: SECRETARIO, modulo: "ebd", permitido: true, nivel: 1, igreja: "Sede" },
      { cargo_id: SECRETARIO, modulo: "ebd", permitido: false, nivel: 0, igreja: "Cong" },
    ]);

    const gravadas = await service.salvar({ companyId: COMPANY, role: "owner" }, [
      { cargoId: SECRETARIO, modulo: "ebd", permitido: false },
      { cargoId: SECRETARIO, modulo: "events", permitido: false }, // igual à de cima: grava também
      { cargoId: DE_OUTRA_REDE, modulo: "campaigns", permitido: true }, // cargo de fora
    ]);

    expect(gravadas).toBe(2);
    expect(repo.salvar).toHaveBeenCalledWith(COMPANY, [
      { cargoId: SECRETARIO, modulo: "ebd", permitido: false },
      { cargoId: SECRETARIO, modulo: "events", permitido: false },
    ]);
  });

  it("recusa módulo que não é liberável por cargo", async () => {
    const { repo, service } = build();
    const err = await service
      .salvar({ companyId: COMPANY, role: "owner" }, [{ cargoId: SECRETARIO, modulo: "billing", permitido: true }])
      .catch((e) => e);
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.salvar).not.toHaveBeenCalled();
  });
});
