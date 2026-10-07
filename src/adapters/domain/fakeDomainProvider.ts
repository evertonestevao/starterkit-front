import { AppError } from "@/lib/errors";
import type { ProviderDomainState } from "@/types/domain";
import type { DomainProvider } from "./DomainProvider";

/**
 * Provedor de mentira para dev e CI: nenhuma chamada de rede, nenhum token.
 * Percorre o mesmo ciclo de vida do real — entra pendente com desafio TXT e só
 * fica pronto depois de um "verificar" — para que o fluxo da tela e do job
 * possam ser exercitados localmente sem domínio nem conta na Vercel.
 */

interface FakeEntry {
  verified: boolean;
}

export function createFakeDomainProvider(): DomainProvider {
  const registry = new Map<string, FakeEntry>();

  function stateOf(domain: string): ProviderDomainState {
    const entry = registry.get(domain);
    if (!entry) {
      throw new AppError("not_found", "Domínio não está registrado no projeto.");
    }
    return {
      verified: entry.verified,
      misconfigured: !entry.verified,
      challenges: entry.verified
        ? []
        : [
            {
              type: "TXT",
              domain: `_fake.${domain}`,
              value: `fake-domain-verify=${domain}`,
            },
          ],
    };
  }

  return {
    name: "fake",
    dns: { aRecord: "203.0.113.10", cnameTarget: "cname.fake-dns.local" },

    async addDomain(domain: string): Promise<ProviderDomainState> {
      if (registry.has(domain)) {
        throw new AppError("conflict", "Este domínio já está em uso em outro projeto.");
      }
      registry.set(domain, { verified: false });
      return stateOf(domain);
    },

    async getDomainState(domain: string): Promise<ProviderDomainState> {
      return stateOf(domain);
    },

    async verifyDomain(domain: string): Promise<ProviderDomainState> {
      const entry = registry.get(domain);
      if (!entry) {
        throw new AppError("not_found", "Domínio não está registrado no projeto.");
      }
      // Um "verificar" resolve: em dev ninguém quer esperar propagação de DNS.
      entry.verified = true;
      return stateOf(domain);
    },

    async removeDomain(domain: string): Promise<void> {
      registry.delete(domain);
    },
  };
}
