/**
 * Comparação de segredos em tempo constante (sem I/O). Evita distinguir um
 * token correto de um quase-correto pela latência da resposta.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
