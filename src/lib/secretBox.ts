import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra simétrica para segredos que precisam VOLTAR ao texto original —
 * hoje, a chave de API da subconta da igreja.
 *
 * Por que não é hash: hash serve para conferir ("é esta senha?"). Aqui o
 * servidor precisa do valor de volta para falar com o provedor em nome da
 * igreja. E por que não guardar em claro: essa chave movimenta o dinheiro da
 * igreja; um dump do banco não pode ser suficiente para usá-la.
 *
 * AES-256-GCM: cifra e autentica. Mexer num byte do texto cifrado faz a
 * decifragem FALHAR em vez de devolver lixo — é o que impede trocar o
 * conteúdo de um campo por outro.
 *
 * A chave vive só no ambiente do servidor (RECEIVING_KEY_SECRET). Perder a
 * chave é perder o acesso às subcontas: trocá-la exige recifrar tudo.
 */

const FORMATO = "v1";

function chaveDe(secret: string): Buffer {
  // Aceita hex (64 chars) ou base64; qualquer outra coisa vira erro na hora
  // de cifrar, e não silenciosamente uma chave fraca.
  const bruto = /^[0-9a-f]{64}$/i.test(secret)
    ? Buffer.from(secret, "hex")
    : Buffer.from(secret, "base64");
  if (bruto.length !== 32) {
    throw new Error("RECEIVING_KEY_SECRET precisa ter 32 bytes (64 hex ou 44 base64)");
  }
  return bruto;
}

/** Devolve "v1.<iv>.<tag>.<cifra>", tudo em base64url. */
export function sealSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", chaveDe(secret), iv);
  const cifra = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMATO, iv.toString("base64url"), tag.toString("base64url"), cifra.toString("base64url")].join(".");
}

/** Lança se o segredo foi adulterado, truncado ou cifrado com outra chave. */
export function openSecret(sealed: string, secret: string): string {
  const partes = sealed.split(".");
  if (partes.length !== 4 || partes[0] !== FORMATO) {
    throw new Error("segredo em formato desconhecido");
  }
  const [, iv, tag, cifra] = partes;
  const decipher = createDecipheriv("aes-256-gcm", chaveDe(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cifra, "base64url")), decipher.final()]).toString("utf8");
}
