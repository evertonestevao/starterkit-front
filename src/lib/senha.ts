/**
 * Regra de senha forte. É a MESMA que o Supabase Auth aplica em produção
 * (8 caracteres, com minúscula, maiúscula, número e símbolo). Repetida aqui
 * para a tela explicar o que falta em português, antes de mandar ao Supabase
 * — que responderia em inglês.
 *
 * Os símbolos são exatamente os que o Supabase conta como símbolo: um "é" ou
 * um espaço não valem lá, então também não valem aqui.
 */

export const SIMBOLOS_DA_SENHA = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

export const SENHA_MIN = 8;
/** O bcrypt do Supabase ignora o que passa de 72 bytes. */
export const SENHA_MAX = 72;

export interface RequisitoDaSenha {
  chave: "tamanho" | "maiuscula" | "minuscula" | "numero" | "simbolo";
  /** Como aparece na lista da tela ("uma letra maiúscula"). */
  texto: string;
  atende: (senha: string) => boolean;
}

export const REQUISITOS_DA_SENHA: readonly RequisitoDaSenha[] = [
  { chave: "tamanho", texto: `pelo menos ${SENHA_MIN} caracteres`, atende: (s) => s.length >= SENHA_MIN },
  { chave: "maiuscula", texto: "uma letra maiúscula", atende: (s) => /[A-Z]/.test(s) },
  { chave: "minuscula", texto: "uma letra minúscula", atende: (s) => /[a-z]/.test(s) },
  { chave: "numero", texto: "um número", atende: (s) => /[0-9]/.test(s) },
  {
    chave: "simbolo",
    texto: "um símbolo (como ! @ # $ % *)",
    atende: (s) => [...s].some((c) => SIMBOLOS_DA_SENHA.includes(c)),
  },
];

/** Uma linha para explicar a regra (debaixo do campo de senha). */
export const DICA_DA_SENHA = `Pelo menos ${SENHA_MIN} caracteres, com letra maiúscula, letra minúscula, número e símbolo (como ! @ # $ %).`;

/** O que ainda falta na senha, na ordem da lista. */
export function requisitosQueFaltam(senha: string): RequisitoDaSenha[] {
  return REQUISITOS_DA_SENHA.filter((r) => !r.atende(senha));
}

/** "A senha precisa ter uma letra maiúscula e um símbolo (...)". Null se não falta nada. */
export function mensagemDoQueFalta(senha: string): string | null {
  const faltam = requisitosQueFaltam(senha).map((r) => r.texto);
  if (faltam.length === 0) return null;
  const lista = faltam.length === 1 ? faltam[0] : `${faltam.slice(0, -1).join(", ")} e ${faltam.at(-1)}`;
  return `A senha precisa ter ${lista}.`;
}
