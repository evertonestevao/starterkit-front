import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Tokens de links enviados por email.
 *
 * O banco guarda só o hash: quem ler a tabela (backup, dump, log de query)
 * não consegue montar um link válido. O texto puro existe uma vez, no email.
 */

/** 32 bytes em base64url — sem caractere que quebre URL. */
export function makeUrlToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashUrlToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
