import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import type { LinhaModulo } from "@/lib/menuPermissoes";
import { createModuloAtivoService, type ModuloAtivoRepository } from "./moduloAtivoService";

const COMPANY = "11111111-1111-4111-8111-111111111111";

function build(linhas: LinhaModulo[] = []) {
  const repo: ModuloAtivoRepository = {
    listarDaRede: vi.fn(async () => linhas),
    salvar: vi.fn(async () => {}),
  };
  return { repo, service: createModuloAtivoService(repo) };
}

describe("moduloAtivoService", () => {
  it("responsável ou administrador configuram; membro não", async () => {
    const { repo, service } = build();
    const err = await service.salvar({ companyId: COMPANY, role: "member" }, []).catch((e) => e);
    expect(isAppError(err) && err.code).toBe("forbidden");
    const ver = await service.matriz({ companyId: COMPANY, role: "member" }).catch((e) => e);
    expect(isAppError(ver) && ver.code).toBe("forbidden");
    expect(repo.salvar).not.toHaveBeenCalled();
    expect(repo.listarDaRede).not.toHaveBeenCalled();

    for (const role of ["owner", "admin"] as const) {
      await expect(service.matriz({ companyId: COMPANY, role })).resolves.toBeInstanceOf(Map);
    }
  });

  it("grava a configuração inteira da igreja", async () => {
    // A sede desligou a EBD; esta igreja já tinha ligado de volta.
    const { repo, service } = build([
      { modulo: "ebd", ativo: false, nivel: 1, igreja: "Sede" },
      { modulo: "ebd", ativo: true, nivel: 0, igreja: "Cong" },
    ]);

    const gravados = await service.salvar({ companyId: COMPANY, role: "admin" }, [
      { modulo: "ebd", ativo: true }, // igual ao que já tinha: grava também (própria)
      { modulo: "programacao", ativo: false }, // a mudança
    ]);

    expect(gravados).toBe(2);
    expect(repo.salvar).toHaveBeenCalledWith(COMPANY, [
      { modulo: "ebd", ativo: true },
      { modulo: "programacao", ativo: false },
    ]);
  });

  it("recusa módulo que não é desligável", async () => {
    const { repo, service } = build();
    const err = await service
      .salvar({ companyId: COMPANY, role: "owner" }, [{ modulo: "membros", ativo: false }])
      .catch((e) => e);
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.salvar).not.toHaveBeenCalled();
  });
});
