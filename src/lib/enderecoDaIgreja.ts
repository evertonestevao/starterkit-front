/**
 * Endereço da igreja em partes, e a linha única que a página pública mostra
 * ("Rua das Flores, 540, sala 2 - Centro, Lins/SP, 16400-010").
 * Sem I/O.
 */

export interface PartesDoEndereco {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export const ENDERECO_VAZIO: PartesDoEndereco = {
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
};

function cepComTraco(cep: string): string {
  return cep.length === 8 ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep;
}

/** Null quando não há nada preenchido. */
export function linhaDoEndereco(p: PartesDoEndereco): string | null {
  const rua = [p.logradouro, p.numero, p.complemento].filter(Boolean).join(", ");
  const cidade = [p.cidade, p.uf].filter(Boolean).join("/");
  const lugar = [p.bairro, cidade].filter(Boolean).join(", ");
  const linha = [rua, lugar].filter(Boolean).join(" - ");
  const comCep = [linha, p.cep ? cepComTraco(p.cep) : ""].filter(Boolean).join(", ");
  return comCep || null;
}
