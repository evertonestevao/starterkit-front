import { normalizeSearch } from "@/lib/search";

/**
 * "Já existe alguém parecido?" no cadastro de membro: evita criar um segundo
 * cadastro de quem já está no sistema (o caso comum é o aluno que a EBD
 * cadastrou só com o primeiro nome). Funções puras; a busca fica no repository.
 */

/** Só os dígitos do telefone. */
export const digitosDoTelefone = (valor: string | null | undefined): string => (valor ?? "").replace(/\D/g, "");

/** Palavras do nome para comparar: sem acento, minúsculas, sem "da/de/do/das/dos/e". */
export function palavrasDoNome(nome: string): string[] {
  const ligacoes = new Set(["da", "de", "do", "das", "dos", "e"]);
  return normalizeSearch(nome)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0 && !ligacoes.has(p));
}

/**
 * O que mandar ao banco: o primeiro nome digitado (3 letras ou mais) e os 8
 * últimos dígitos do telefone (8 ou mais dígitos). Sem um nem outro, não busca.
 */
export function termosDaBusca(
  nome: string,
  telefone: string,
): { primeiroNome: string | null; fimDoTelefone: string | null } {
  const primeiro = palavrasDoNome(nome)[0] ?? "";
  const digitos = digitosDoTelefone(telefone);
  return {
    primeiroNome: primeiro.length >= 3 ? primeiro : null,
    fimDoTelefone: digitos.length >= 8 ? digitos.slice(-8) : null,
  };
}

export interface CandidatoParecido {
  id: string;
  nome: string;
  whatsapp: string | null;
}

export interface Parecido<T extends CandidatoParecido> {
  candidato: T;
  /** O telefone digitado é o mesmo: quase sempre é a mesma pessoa. */
  mesmoTelefone: boolean;
}

/**
 * Ordena os candidatos: mesmo telefone primeiro; depois quem tem mais palavras
 * do nome em comum. Fica de fora quem não tem o mesmo telefone nem começa (em
 * alguma palavra do nome) com o primeiro nome digitado.
 */
export function ordenarParecidos<T extends CandidatoParecido>(
  candidatos: readonly T[],
  digitado: { nome: string; telefone: string },
  limite = 6,
): Array<Parecido<T>> {
  const palavras = palavrasDoNome(digitado.nome);
  const primeiro = palavras[0] ?? "";
  const fim = digitosDoTelefone(digitado.telefone).slice(-8);
  const comTelefone = fim.length >= 8;

  return candidatos
    .map((candidato) => {
      const dele = palavrasDoNome(candidato.nome);
      const mesmoTelefone = comTelefone && digitosDoTelefone(candidato.whatsapp).endsWith(fim);
      // Enquanto digita, o primeiro nome ainda está incompleto: vale o começo da palavra.
      const mesmoPrimeiroNome = primeiro.length >= 3 && dele.some((p) => p.startsWith(primeiro));
      const emComum = palavras.filter((p) => dele.some((d) => d === p || (p === primeiro && d.startsWith(p)))).length;
      // Primeiro nome igual ao primeiro nome dele vale mais do que achar no meio.
      const noComeco = primeiro.length >= 3 && (dele[0] ?? "").startsWith(primeiro) ? 1 : 0;
      return {
        candidato,
        mesmoTelefone,
        mesmoPrimeiroNome,
        pontos: (mesmoTelefone ? 100 : 0) + emComum * 2 + noComeco,
      };
    })
    .filter((x) => x.mesmoTelefone || x.mesmoPrimeiroNome)
    .sort((a, b) => b.pontos - a.pontos || a.candidato.nome.localeCompare(b.candidato.nome, "pt-BR"))
    .slice(0, limite)
    .map(({ candidato, mesmoTelefone }) => ({ candidato, mesmoTelefone }));
}
