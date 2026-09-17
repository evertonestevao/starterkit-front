import type { DnsRecordInstruction, DomainVerificationChallenge } from "@/types/domain";

/**
 * Utilitários puros de hostname (sem I/O). Usados nos dois extremos do fluxo:
 * no proxy, para normalizar o Host de cada request, e no service, para validar
 * o que a igreja digitou e montar as instruções de DNS.
 */

/** Comprimentos do RFC 1035: 253 no host inteiro, 63 por label. */
const MAX_HOST_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;

const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Sufixos de dois níveis: `igrejax.com.br` é domínio RAIZ, não subdomínio.
 * Sem esta lista, um `.com.br` (o caso comum aqui) receberia instrução de CNAME
 * na raiz — que a maioria dos registradores recusa, e o BR em particular.
 *
 * Heurística, não Public Suffix List completa: sufixo desconhecido cai na regra
 * geral de dois labels. Acrescentar aqui é barato quando aparecer um caso novo.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "edu.br",
  "art.br",
  "blog.br",
  "eco.br",
  "ind.br",
  "inf.br",
  "rec.br",
  "srv.br",
  "tv.br",
  "co.uk",
  "org.uk",
  "me.uk",
  "com.au",
  "net.au",
  "org.au",
  "com.pt",
  "com.ar",
  "com.mx",
  "co.jp",
]);

/**
 * Hosts que nenhuma igreja pode reivindicar. Além do óbvio (o domínio da
 * plataforma), bloqueia os domínios de infraestrutura: um tenant que
 * registrasse `*.vercel.app` ou o host do Supabase apontaria tráfego nosso
 * para dentro do projeto dele.
 */
const RESERVED_SUFFIXES = [
  "vercel.app",
  "vercel.com",
  "vercel-dns.com",
  "supabase.co",
  "supabase.in",
  "localhost",
  "local",
  "internal",
  "example.com",
];

/**
 * Normaliza o que veio do usuário ou do header Host: tira protocolo, caminho,
 * porta, ponto final e espaços; devolve minúsculo. Não valida — use
 * `isValidHostname` depois.
 */
export function normalizeHostname(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+\-.]*:\/\//, "") // protocolo
    .replace(/^[^@/]*@/, "") // credenciais coladas na URL
    .replace(/[/?#].*$/, "") // caminho, query, hash
    .replace(/:\d+$/, "") // porta
    .replace(/\.$/, ""); // ponto final do FQDN
}

export function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

export function isValidHostname(host: string): boolean {
  if (!host || host.length > MAX_HOST_LENGTH) return false;
  if (isIpAddress(host)) return false;
  if (!HOSTNAME_PATTERN.test(host)) return false;

  const labels = host.split(".");
  if (labels.some((label) => label.length > MAX_LABEL_LENGTH)) return false;

  // TLD puramente numérico não existe e denuncia IP malformado.
  return !/^\d+$/.test(labels[labels.length - 1]);
}

/** `igrejax.com.br` e `igrejax.org` são raiz; `www.igrejax.com.br` não é. */
export function isApexDomain(host: string): boolean {
  const labels = host.split(".");
  if (labels.length < 2) return false;
  const lastTwo = labels.slice(-2).join(".");
  return labels.length === (MULTI_LABEL_SUFFIXES.has(lastTwo) ? 3 : 2);
}

/** Parte do host antes do domínio raiz — "@" quando é a própria raiz. */
export function recordNameFor(host: string): string {
  if (isApexDomain(host)) return "@";
  const labels = host.split(".");
  const lastTwo = labels.slice(-2).join(".");
  const rootSize = MULTI_LABEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(0, labels.length - rootSize).join(".") || "@";
}

function isSameOrSubdomainOf(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

/**
 * Bloqueia o host da própria plataforma (e subdomínios dele) e a infra.
 * `primaryHost` entra como parâmetro em vez de env para manter a função pura.
 */
export function isReservedHost(host: string, primaryHost: string): boolean {
  const normalizedPrimary = normalizeHostname(primaryHost);
  if (normalizedPrimary && isSameOrSubdomainOf(host, normalizedPrimary)) return true;
  return RESERVED_SUFFIXES.some((suffix) => isSameOrSubdomainOf(host, suffix));
}

export interface DnsInstructionParams {
  domain: string;
  /** Valor do registro A para domínio raiz (configurável por env). */
  aRecord: string;
  /** Alvo do CNAME para subdomínio (configurável por env). */
  cnameTarget: string;
  /** Desafios de posse devolvidos pelo provedor, se houver. */
  challenges?: DomainVerificationChallenge[];
}

/**
 * Monta os registros que a igreja precisa criar. Raiz recebe A; subdomínio
 * recebe CNAME. Desafios TXT do provedor entram como registros adicionais.
 */
export function dnsInstructionsFor({
  domain,
  aRecord,
  cnameTarget,
  challenges = [],
}: DnsInstructionParams): DnsRecordInstruction[] {
  const apex = isApexDomain(domain);

  const records: DnsRecordInstruction[] = [
    apex
      ? {
          type: "A",
          name: "@",
          value: aRecord,
          hint: "Domínio raiz aponta por registro A. Se já existir um registro A com outro valor, substitua-o.",
        }
      : {
          type: "CNAME",
          name: recordNameFor(domain),
          value: cnameTarget,
          hint: "Subdomínio aponta por CNAME. Não crie um registro A junto — um cancela o outro.",
        },
  ];

  for (const challenge of challenges) {
    records.push({
      type: "TXT",
      name: recordNameFor(challenge.domain),
      value: challenge.value,
      hint: "Registro temporário que comprova que o domínio é seu. Pode ser removido depois que o domínio ficar ativo.",
    });
  }

  return records;
}
