import "server-only";
import type { CepProvider } from "./CepProvider";
import { createViaCepProvider } from "./viaCepProvider";

export type { CepProvider, EnderecoDoCep } from "./CepProvider";

/**
 * Factory do provedor de CEP. Hoje só o ViaCEP; a troca (ou uma segunda
 * tentativa em outro provedor) acontece SÓ aqui.
 */
export function getCepProvider(): CepProvider {
  return createViaCepProvider();
}
