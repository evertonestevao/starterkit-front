import "server-only";
import { getServerEnv, requireServerEnv } from "@/config/env";
import type { DomainProvider } from "./DomainProvider";
import { createFakeDomainProvider } from "./fakeDomainProvider";
import { createVercelDomainProvider } from "./vercelDomainProvider";

export type { DomainProvider } from "./DomainProvider";

/**
 * Factory do provedor ativo, escolhido por DOMAIN_PROVIDER. Default é `fake`:
 * um ambiente sem token da Vercel configurado deve funcionar, não explodir.
 *
 * O fake é um singleton porque guarda estado em memória — recriá-lo a cada
 * chamada faria o domínio "sumir" entre a tela e o job em dev.
 */

let fakeProvider: DomainProvider | undefined;

export function getDomainProvider(): DomainProvider {
  const env = getServerEnv();

  switch (env.DOMAIN_PROVIDER) {
    case "vercel":
      return createVercelDomainProvider({
        apiToken: requireServerEnv("VERCEL_API_TOKEN"),
        projectId: requireServerEnv("VERCEL_PROJECT_ID"),
        teamId: env.VERCEL_TEAM_ID,
        aRecord: env.VERCEL_DNS_A_RECORD,
        cnameTarget: env.VERCEL_DNS_CNAME,
      });
    case "fake":
      fakeProvider ??= createFakeDomainProvider();
      return fakeProvider;
  }
}
