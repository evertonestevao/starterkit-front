import type { HostLookup, HostTenantMatch } from "@/services/hostTenantService";

/**
 * Lookup host -> igreja por REST puro (PostgREST), sem @supabase/supabase-js.
 *
 * Por que REST e não o client: este código roda no proxy, em toda request. O
 * client do Supabase carrega sessão, refresh de token e cookies — nada disso é
 * necessário aqui, e o custo por request seria pago sempre. A RPC usada é
 * `resolve_church_by_domain`, security definer, que só devolve domínio ATIVO e
 * apenas o par (id, public_code).
 */

/** O proxy não pode ficar pendurado esperando o banco: melhor não resolver. */
const LOOKUP_TIMEOUT_MS = 1_500;

export interface RestChurchDomainLookupConfig {
  supabaseUrl: string;
  anonKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface RpcRow {
  id?: string;
  public_code?: string;
}

export function createRestChurchDomainLookup(
  config: RestChurchDomainLookupConfig,
): HostLookup {
  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? LOOKUP_TIMEOUT_MS;
  const endpoint = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/resolve_church_by_domain`;

  return async function lookup(host: string): Promise<HostTenantMatch | null> {
    const res = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_host: host }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`lookup de domínio respondeu ${res.status}`);
    }

    const rows = (await res.json()) as RpcRow[];
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id || !row.public_code) return null;

    return { churchId: row.id, publicCode: row.public_code };
  };
}
