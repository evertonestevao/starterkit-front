"use server";

import { getCepProvider } from "@/adapters/cep";
import type { EnderecoDoCep } from "@/adapters/cep";
import { createRateLimiter } from "@/server/rateLimit";
import { exigeUsuarioValido } from "@/server/session";
import { createCepService } from "@/services/cepService";
import { toActionError } from "./action-state";

/**
 * 30 consultas por minuto por usuário: sobra para quem está cadastrando e
 * impede usar o sistema como ponte para consultar CEP em massa no provedor.
 */
const limite = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** Endereço de um CEP, para preencher formulário. Só para quem está logado. */
export async function buscarCepAction(cep: string): Promise<{ endereco?: EnderecoDoCep; error?: string }> {
  try {
    const usuario = await exigeUsuarioValido();
    await limite.consume(`cep:${usuario.id}`);
    return { endereco: await createCepService({ provider: getCepProvider() }).buscarEndereco(cep) };
  } catch (err) {
    return { error: toActionError(err).error };
  }
}
