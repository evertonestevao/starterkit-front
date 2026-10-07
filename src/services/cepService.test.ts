import { describe, expect, it } from "vitest";
import type { CepProvider } from "@/adapters/cep/CepProvider";
import { isAppError } from "@/lib/errors";
import { createCepService } from "./cepService";

const BAURU = { logradouro: "Rua das Flores", bairro: "Centro", cidade: "Bauru", uf: "SP" };

function servico(buscar: CepProvider["buscar"]) {
  const pedidos: string[] = [];
  const svc = createCepService({
    provider: {
      name: "fake",
      buscar: async (cep) => {
        pedidos.push(cep);
        return buscar(cep);
      },
    },
  });
  return { svc, pedidos };
}

describe("cepService", () => {
  it("consulta só com os 8 dígitos, com ou sem traço", async () => {
    const { svc, pedidos } = servico(async () => BAURU);
    await expect(svc.buscarEndereco("17012-345")).resolves.toEqual(BAURU);
    expect(pedidos).toEqual(["17012345"]);
  });

  it("CEP incompleto ou que não é texto nem chega ao provedor", async () => {
    const { svc, pedidos } = servico(async () => BAURU);
    for (const ruim of ["1701", "", "170123456", null, 17012345]) {
      const err = await svc.buscarEndereco(ruim).catch((e) => e);
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(pedidos).toEqual([]);
  });

  it("CEP que não existe é não encontrado", async () => {
    const { svc } = servico(async () => null);
    const err = await svc.buscarEndereco("00000000").catch((e) => e);
    expect(isAppError(err) && err.code).toBe("not_found");
  });

  it("provedor fora do ar vira mensagem amigável, sem detalhe interno", async () => {
    const { svc } = servico(async () => {
      throw new Error("ECONNRESET viacep.com.br");
    });
    const err = await svc.buscarEndereco("17012345").catch((e) => e);
    expect(isAppError(err) && err.code).toBe("internal_error");
    expect(err.message).not.toContain("ECONNRESET");
  });
});
