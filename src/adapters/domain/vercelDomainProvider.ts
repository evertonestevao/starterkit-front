import { AppError } from "@/lib/errors";
import type { DomainVerificationChallenge, ProviderDomainState } from "@/types/domain";
import type { DomainProvider } from "./DomainProvider";

/**
 * Adapter da Vercel Domains API via REST (fetch), sem SDK — mesma escolha do
 * stripeGateway: nenhuma dependência nova e o provedor fica 100% atrás da
 * interface DomainProvider.
 *
 * Só roda no servidor: o token da Vercel dá acesso de escrita ao projeto
 * inteiro e nunca pode chegar ao client.
 */

const VERCEL_API = "https://api.vercel.com";

/**
 * Valores default de DNS da Vercel. Vêm por env porque a Vercel já os trocou
 * antes; deixar hardcoded significa domínio de cliente quebrado numa mudança
 * silenciosa do provedor.
 */
export const VERCEL_DEFAULT_A_RECORD = "76.76.21.21";
export const VERCEL_DEFAULT_CNAME = "cname.vercel-dns.com";

export interface VercelDomainProviderConfig {
  apiToken: string;
  projectId: string;
  /** Obrigatório quando o projeto pertence a um time, não a uma conta pessoal. */
  teamId?: string;
  aRecord?: string;
  cnameTarget?: string;
  /** Injetável nos testes. */
  fetchFn?: typeof fetch;
}

interface VercelError {
  code?: string;
  message?: string;
}

interface VercelProjectDomain {
  name?: string;
  verified?: boolean;
  verification?: Array<{
    type?: string;
    domain?: string;
    value?: string;
    reason?: string;
  }>;
  error?: VercelError;
}

interface VercelDomainConfig {
  misconfigured?: boolean;
  /** Presente em respostas novas da API; usado como fonte preferida do DNS. */
  recommendedIPv4?: Array<{ value?: string[] }>;
  recommendedCNAME?: Array<{ value?: string }>;
}

/** Códigos da Vercel que significam "esse domínio não é seu / já é de alguém". */
const CONFLICT_CODES = new Set([
  "domain_already_in_use",
  "domain_taken",
  "forbidden",
  "not_modified",
]);

export function createVercelDomainProvider(
  config: VercelDomainProviderConfig,
): DomainProvider {
  const fetchFn = config.fetchFn ?? fetch;
  const teamQuery = config.teamId ? `?teamId=${encodeURIComponent(config.teamId)}` : "";

  function withTeam(path: string): string {
    if (!config.teamId) return path;
    return path.includes("?")
      ? `${path}&teamId=${encodeURIComponent(config.teamId)}`
      : `${path}${teamQuery}`;
  }

  async function vercelRequest<T>(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: Record<string, unknown>,
    /** Status tratados como sucesso "vazio" (ex.: 404 no DELETE). */
    tolerate: number[] = [],
  ): Promise<{ status: number; data: T }> {
    let res: Response;
    try {
      res = await fetchFn(`${VERCEL_API}${withTeam(path)}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Rede fora do ar não é culpa da igreja: mensagem neutra e detalhe no log.
      throw new AppError(
        "domain_error",
        "Não foi possível falar com o provedor de domínios agora. Tente de novo em instantes.",
        err,
      );
    }

    const data = (await res.json().catch(() => ({}))) as T & { error?: VercelError };

    if (!res.ok && !tolerate.includes(res.status)) {
      const code = data.error?.code ?? "";
      if (res.status === 409 || CONFLICT_CODES.has(code)) {
        throw new AppError(
          "conflict",
          "Este domínio já está em uso em outra conta ou projeto. Verifique se ele não está cadastrado em outro serviço.",
          { status: res.status, code },
        );
      }
      if (res.status === 429) {
        throw new AppError(
          "rate_limited",
          "O provedor de domínios pediu para aguardar. Tente novamente em alguns minutos.",
          { status: res.status, code },
        );
      }
      // `internal` só vai para o log do servidor — nunca serializado ao usuário,
      // e o token não está aqui porque só existe no header.
      throw new AppError(
        "domain_error",
        "O provedor de domínios recusou a operação.",
        { status: res.status, code, message: data.error?.message },
      );
    }

    return { status: res.status, data };
  }

  function toChallenges(domain: VercelProjectDomain): DomainVerificationChallenge[] {
    return (domain.verification ?? [])
      .filter((entry) => entry.type && entry.domain && entry.value)
      .map((entry) => ({
        type: String(entry.type).toUpperCase(),
        domain: String(entry.domain),
        value: String(entry.value),
        reason: entry.reason,
      }));
  }

  async function readConfig(domain: string): Promise<boolean> {
    const { data } = await vercelRequest<VercelDomainConfig>(
      `/v6/domains/${encodeURIComponent(domain)}/config`,
      "GET",
    );
    // Ausência do campo é tratada como "ainda não apontado": o custo de errar
    // para o lado otimista seria marcar como ativo um domínio que não resolve.
    return data.misconfigured !== false;
  }

  async function describe(domain: string): Promise<ProviderDomainState> {
    const { data } = await vercelRequest<VercelProjectDomain>(
      `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(domain)}`,
      "GET",
    );
    const misconfigured = await readConfig(domain);
    const challenges = toChallenges(data);

    return {
      verified: data.verified === true,
      misconfigured,
      challenges,
      reason: challenges[0]?.reason,
    };
  }

  return {
    name: "vercel",

    dns: {
      aRecord: config.aRecord ?? VERCEL_DEFAULT_A_RECORD,
      cnameTarget: config.cnameTarget ?? VERCEL_DEFAULT_CNAME,
    },

    async addDomain(domain: string): Promise<ProviderDomainState> {
      const { data } = await vercelRequest<VercelProjectDomain>(
        `/v10/projects/${encodeURIComponent(config.projectId)}/domains`,
        "POST",
        { name: domain },
      );

      const challenges = toChallenges(data);
      // O config é consultado à parte: o POST responde sobre posse, não sobre
      // para onde o DNS aponta.
      const misconfigured = await readConfig(domain).catch(() => true);

      return {
        verified: data.verified === true,
        misconfigured,
        challenges,
        reason: challenges[0]?.reason,
      };
    },

    getDomainState: describe,

    async verifyDomain(domain: string): Promise<ProviderDomainState> {
      // 400 aqui significa "desafio ainda não atendido", que é estado esperado
      // do fluxo, não falha: seguimos para describe() e o status sai de lá.
      await vercelRequest<VercelProjectDomain>(
        `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(domain)}/verify`,
        "POST",
        undefined,
        [400, 403],
      );
      return describe(domain);
    },

    async removeDomain(domain: string): Promise<void> {
      await vercelRequest(
        `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(domain)}`,
        "DELETE",
        undefined,
        [404],
      );
    },
  };
}
