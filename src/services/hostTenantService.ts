import { isIpAddress, isValidHostname, normalizeHostname } from "@/lib/domain";

/**
 * Resolve "qual igreja responde por este hostname?" para o proxy.
 *
 * Restrições do ambiente (ver node_modules/next/dist/docs/.../proxy.md): o
 * proxy roda antes de tudo, pode ser distribuído no CDN e não deve depender de
 * estado compartilhado. Por isso:
 *
 * - o cache é BEST-EFFORT (um miss custa uma consulta, nunca uma falha);
 * - qualquer erro de lookup vira "não é domínio customizado", e a request segue
 *   o caminho normal. O domínio próprio jamais pode derrubar o acesso.
 */

export interface HostTenantMatch {
  churchId: string;
  publicCode: string;
}

export type HostLookup = (host: string) => Promise<HostTenantMatch | null>;

export interface HostTenantServiceDeps {
  lookup: HostLookup;
  /** Host da plataforma: tudo que estiver sob ele NÃO é domínio customizado. */
  primaryHost: string;
  /** TTL do acerto. Curto para que remover um domínio tenha efeito rápido. */
  ttlMs?: number;
  /** TTL do "não existe" — blinda contra enxurrada de hosts desconhecidos. */
  negativeTtlMs?: number;
  now?: () => number;
}

interface CacheEntry {
  value: HostTenantMatch | null;
  expiresAt: number;
}

/** Hosts que nunca são domínio de igreja: infra e desenvolvimento. */
const NON_TENANT_SUFFIXES = ["vercel.app", "localhost", "local"];

export function createHostTenantService(deps: HostTenantServiceDeps) {
  const {
    lookup,
    ttlMs = 60_000,
    negativeTtlMs = 30_000,
    now = () => Date.now(),
  } = deps;
  const primaryHost = normalizeHostname(deps.primaryHost);
  const cache = new Map<string, CacheEntry>();

  function isPlatformHost(host: string): boolean {
    if (!host || isIpAddress(host)) return true;
    if (primaryHost && (host === primaryHost || host.endsWith(`.${primaryHost}`))) {
      return true;
    }
    return NON_TENANT_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  }

  return {
    /** Normaliza e diz se o host pertence à plataforma (não precisa de lookup). */
    isPlatformHost(rawHost: string): boolean {
      return isPlatformHost(normalizeHostname(rawHost));
    },

    /**
     * Devolve a igreja do host customizado, ou null quando o host é da
     * plataforma, é inválido, não está cadastrado ou o lookup falhou.
     */
    async resolve(rawHost: string | null | undefined): Promise<HostTenantMatch | null> {
      if (!rawHost) return null;
      const host = normalizeHostname(rawHost);
      if (isPlatformHost(host) || !isValidHostname(host)) return null;

      const cached = cache.get(host);
      if (cached && cached.expiresAt > now()) {
        return cached.value;
      }

      try {
        const match = await lookup(host);
        cache.set(host, {
          value: match,
          expiresAt: now() + (match ? ttlMs : negativeTtlMs),
        });
        return match;
      } catch (err) {
        // Fail-open deliberado: um Supabase lento ou fora do ar não pode virar
        // erro 500 em toda request da aplicação. O host simplesmente não
        // resolve como customizado nesta passagem, e o acesso pelo endereço
        // padrão segue intacto. Não cacheamos a falha para não prolongá-la.
        console.warn("[host-tenant] lookup falhou, seguindo sem domínio customizado", {
          host,
          err: err instanceof Error ? err.message : "erro desconhecido",
        });
        return null;
      }
    },
  };
}

export type HostTenantService = ReturnType<typeof createHostTenantService>;
