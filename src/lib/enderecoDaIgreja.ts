import type { EnderecoDoCep } from "@/adapters/cep/CepProvider";

/**
 * Endereço da igreja em uma linha, montado a partir do CEP:
 * "Rua das Flores, , Centro, Lins/SP" vira "Rua das Flores, - Centro, Lins/SP".
 * O número fica para a pessoa digitar logo depois de "Rua das Flores, ".
 * Sem I/O.
 */
export function enderecoPeloCep(achado: EnderecoDoCep): { texto: string; posicaoDoNumero: number } {
  const cidade = [achado.cidade, achado.uf].filter(Boolean).join("/");
  const rua = achado.logradouro.trim();
  const depois = [achado.bairro.trim(), cidade].filter(Boolean).join(", ");
  if (!rua) return { texto: depois, posicaoDoNumero: 0 };
  const inicio = `${rua}, `;
  return { texto: depois ? `${inicio} - ${depois}` : inicio, posicaoDoNumero: inicio.length };
}
