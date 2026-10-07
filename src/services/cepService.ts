import type { CepProvider, EnderecoDoCep } from "@/adapters/cep/CepProvider";
import { AppError } from "@/lib/errors";

/**
 * Endereço a partir do CEP, para preencher formulário. É conveniência: o
 * provedor fora do ar vira uma mensagem amigável, e a pessoa digita.
 */
export function createCepService(deps: { provider: CepProvider }) {
  return {
    async buscarEndereco(cep: unknown): Promise<EnderecoDoCep> {
      const digitos = typeof cep === "string" ? cep.replace(/\D/g, "") : "";
      if (digitos.length !== 8) throw new AppError("validation_error", "CEP com 8 dígitos, por favor.");

      let endereco: EnderecoDoCep | null;
      try {
        endereco = await deps.provider.buscar(digitos);
      } catch (err) {
        throw new AppError(
          "internal_error",
          "Não foi possível consultar o CEP agora. Preencha o endereço à mão.",
          err,
        );
      }
      if (!endereco) throw new AppError("not_found", "CEP não encontrado. Confira o número ou preencha o endereço à mão.");
      return endereco;
    },
  };
}

export type CepService = ReturnType<typeof createCepService>;
