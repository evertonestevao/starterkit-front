import { caminhoDaIgreja } from "@/lib/churchPaths";
import type { DomainProvider } from "@/adapters/domain/DomainProvider";
import {
  dnsInstructionsFor,
  isReservedHost,
  isValidHostname,
  normalizeHostname,
} from "@/lib/domain";
import { AppError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import type { Church, ChurchDomainStatus, RoleCode } from "@/types/database";
import type {
  ChurchDomainView,
  DomainVerificationChallenge,
  ProviderDomainState,
} from "@/types/domain";

/**
 * Regra de negócio do domínio próprio.
 *
 * Duas premissas que valem para tudo aqui:
 *
 * 1. O endereço padrão (/igreja/{public_code}) NUNCA depende deste fluxo. Toda
 *    falha — provedor fora do ar, DNS errado, domínio expirado — degrada para
 *    "a igreja continua no endereço padrão", nunca para "a igreja sumiu".
 * 2. A promoção para `ativo` só acontece depois de o provedor confirmar posse
 *    E apontamento de DNS. É o único estado que faz o proxy servir o host.
 */

/** Papéis que podem mexer no domínio. Espelha a policy de RLS da migration. */
const DOMAIN_MANAGER_ROLES: RoleCode[] = ["owner", "admin"];

/** Depois disso sem DNS apontado, o domínio vira `erro` e para de ser sondado. */
export const PENDING_DEADLINE_DAYS = 14;

export interface DomainActor {
  companyId: string;
  role: RoleCode;
}

/** Leituras e escritas feitas com o client do usuário (RLS + RPC). */
export interface ChurchDomainRepository {
  findById(churchId: string): Promise<Church | null>;
  listByCompany(companyId: string): Promise<Church[]>;
  /** RPC claim_church_domain: reserva o domínio como pendente. */
  claim(churchId: string, domain: string): Promise<Church>;
  /** RPC set_church_domain_verification: nunca aceita `ativo`. */
  saveVerification(
    churchId: string,
    challenges: DomainVerificationChallenge[] | null,
    status: Exclude<ChurchDomainStatus, "ativo">,
  ): Promise<void>;
  /** RPC clear_church_domain. */
  clear(churchId: string): Promise<void>;
}

export interface DomainStatusUpdate {
  status: ChurchDomainStatus;
  challenges?: DomainVerificationChallenge[] | null;
  error?: string | null;
  verifiedAt?: string | null;
}

/**
 * Escritas privilegiadas (service_role). Existem separadas porque só elas podem
 * marcar `ativo` — e só depois de o provedor confirmar. Implementação vive em
 * src/server, nunca alcançável pelo client.
 */
export interface ChurchDomainStatusWriter {
  applyStatus(churchId: string, update: DomainStatusUpdate): Promise<void>;
  listPendingVerification(limit: number): Promise<PendingDomain[]>;
}

export interface PendingDomain {
  id: string;
  dominio_customizado: string | null;
  dominio_status: ChurchDomainStatus;
  dominio_solicitado_em: string | null;
}

export interface ChurchDomainServiceDeps {
  repo: ChurchDomainRepository;
  statusWriter: ChurchDomainStatusWriter;
  provider: DomainProvider;
  /** Host da plataforma (ex.: tagigreja.com.br), usado no blocklist e nas URLs. */
  appUrl: string;
  rateLimiter?: RateLimiter;
  now?: () => Date;
}

/**
 * Traduz o estado do provedor para o nosso enum. Pura de propósito: é a regra
 * mais fácil de quebrar sem perceber, então fica isolada e testada.
 */
export function resolveDomainStatus(
  state: ProviderDomainState,
): { status: Extract<ChurchDomainStatus, "pendente_dns" | "ativo">; error: string | null } {
  if (!state.verified) {
    return {
      status: "pendente_dns",
      error: null, // Falta o TXT: é passo do fluxo, não erro.
    };
  }
  if (state.misconfigured) {
    return {
      status: "pendente_dns",
      error: null, // Posse provada, falta apontar o A/CNAME.
    };
  }
  return { status: "ativo", error: null };
}

/**
 * Valida o que a igreja digitou. Recusa cedo o que a API do provedor recusaria
 * tarde (e o que ela ACEITARIA mas não deveria: host da própria plataforma).
 */
export function normalizeDomainInput(raw: unknown, appUrl: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new AppError("validation_error", "Informe o domínio da sua igreja.");
  }

  const host = normalizeHostname(raw);

  if (!isValidHostname(host)) {
    throw new AppError(
      "validation_error",
      "Domínio inválido. Use o formato igrejax.com.br, sem http:// e sem barra no final.",
    );
  }

  const primaryHost = normalizeHostname(appUrl);
  if (isReservedHost(host, primaryHost)) {
    throw new AppError(
      "validation_error",
      "Este domínio é reservado e não pode ser usado como domínio próprio.",
    );
  }

  return host;
}

function requireDomainManager(church: Church, actor: DomainActor): void {
  // Checagem replicada no service (CLAUDE.md): a RLS é a barreira final, não a
  // única. Uma igreja de OUTRA empresa não passa daqui nem que a query retorne.
  if (!church.company_id || church.company_id !== actor.companyId) {
    throw new AppError("not_found", "Igreja não encontrada.");
  }
  if (!DOMAIN_MANAGER_ROLES.includes(actor.role)) {
    throw new AppError(
      "forbidden",
      "Só quem administra a igreja pode configurar o domínio próprio.",
    );
  }
}

export function createChurchDomainService(deps: ChurchDomainServiceDeps) {
  const { repo, statusWriter, provider, appUrl, rateLimiter } = deps;
  const now = deps.now ?? (() => new Date());

  function buildView(church: Church): ChurchDomainView {
    const domain = church.dominio_customizado;
    const challenges = church.dominio_verificacao ?? [];

    return {
      churchId: church.id,
      churchName: church.name,
      // Sempre presente, com domínio próprio ou sem ele.
      defaultUrl: `${appUrl.replace(/\/$/, "")}${caminhoDaIgreja(church.public_code)}`,
      sponsorInviteUrl: `${appUrl.replace(/\/$/, "")}/patrocinador/patrocinar/${encodeURIComponent(church.public_code)}`,
      networkDomain: church.tipo === "sede" && church.parent_id === null,
      domain,
      status: church.dominio_status,
      supportPaid: church.dominio_suporte_pago,
      verifiedAt: church.dominio_verificado_em,
      lastError: church.dominio_ultimo_erro,
      dns: domain
        ? dnsInstructionsFor({
            domain,
            aRecord: provider.dns.aRecord,
            cnameTarget: provider.dns.cnameTarget,
            challenges,
          })
        : [],
      customUrl:
        domain && church.dominio_status === "ativo" ? `https://${domain}` : null,
    };
  }

  async function loadOwned(churchId: string, actor: DomainActor): Promise<Church> {
    const church = await repo.findById(churchId);
    if (!church || church.deleted_at) {
      throw new AppError("not_found", "Igreja não encontrada.");
    }
    requireDomainManager(church, actor);
    return church;
  }

  return {
    /** Visões de domínio de todas as igrejas da empresa ativa. */
    async listForCompany(actor: DomainActor): Promise<ChurchDomainView[]> {
      const churches = await repo.listByCompany(actor.companyId);
      return churches.map(buildView);
    },

    async getForChurch(churchId: string, actor: DomainActor): Promise<ChurchDomainView> {
      return buildView(await loadOwned(churchId, actor));
    },

    /**
     * Cadastra o domínio. A reserva no banco vem ANTES da chamada ao provedor:
     * o índice único é o que impede duas igrejas de disputarem o mesmo host, e
     * ele só vale se a linha já existir. Se o provedor recusar, a reserva é
     * desfeita — domínio preso em pendente para sempre seria pior que o erro.
     */
    async claimDomain(
      churchId: string,
      rawDomain: unknown,
      actor: DomainActor,
    ): Promise<ChurchDomainView> {
      const church = await loadOwned(churchId, actor);
      const domain = normalizeDomainInput(rawDomain, appUrl);

      if (church.dominio_customizado === domain && church.dominio_status === "ativo") {
        return buildView(church);
      }

      await rateLimiter?.consume(`domain-claim:${actor.companyId}`);

      // Domínio anterior sai do provedor para não ficar roteando para cá.
      if (church.dominio_customizado && church.dominio_customizado !== domain) {
        await provider.removeDomain(church.dominio_customizado).catch(() => {
          // Limpeza best-effort: não impede a igreja de trocar de domínio.
        });
      }

      const claimed = await repo.claim(churchId, domain);

      let state: ProviderDomainState;
      try {
        state = await provider.addDomain(domain);
      } catch (err) {
        await repo.clear(churchId).catch(() => {});
        throw err;
      }

      const { status } = resolveDomainStatus(state);
      // A RPC do client nunca grava `ativo` — é ela que um atacante alcançaria
      // chamando PostgREST direto. A promoção passa pelo statusWriter, e só
      // com a confirmação do provedor na mão (caso do domínio que já apontava
      // para cá antes do cadastro).
      await repo.saveVerification(
        churchId,
        state.challenges,
        status === "ativo" ? "verificando" : "pendente_dns",
      );

      if (status === "ativo") {
        await statusWriter.applyStatus(churchId, {
          status: "ativo",
          challenges: [],
          error: null,
          verifiedAt: now().toISOString(),
        });
      }

      return buildView({
        ...claimed,
        dominio_status: status,
        dominio_verificacao: state.challenges,
      });
    },

    /**
     * "Verificar agora" da tela. Passa pelo provedor e, se ele confirmar,
     * promove via statusWriter — a confirmação externa é sempre o gatilho,
     * nunca a vontade do client.
     */
    async refreshDomain(churchId: string, actor: DomainActor): Promise<ChurchDomainView> {
      const church = await loadOwned(churchId, actor);
      if (!church.dominio_customizado) {
        throw new AppError("validation_error", "Nenhum domínio próprio cadastrado.");
      }

      await rateLimiter?.consume(`domain-verify:${actor.companyId}`);

      const domain = church.dominio_customizado;
      let state: ProviderDomainState;
      try {
        state = await provider.verifyDomain(domain);
      } catch (err) {
        // Falha de verificação não derruba o domínio já ativo nem apaga nada.
        await statusWriter.applyStatus(churchId, {
          status: church.dominio_status === "ativo" ? "ativo" : "pendente_dns",
          error: "Não foi possível verificar agora. Tente novamente em instantes.",
        });
        throw err;
      }

      const { status } = resolveDomainStatus(state);
      await statusWriter.applyStatus(churchId, {
        status,
        challenges: state.challenges,
        error: null,
        verifiedAt: status === "ativo" ? now().toISOString() : null,
      });

      return buildView({
        ...church,
        dominio_status: status,
        dominio_verificacao: state.challenges,
        dominio_ultimo_erro: null,
      });
    },

    /** Remove o domínio próprio. A igreja segue acessível pelo endereço padrão. */
    async removeDomain(churchId: string, actor: DomainActor): Promise<ChurchDomainView> {
      const church = await loadOwned(churchId, actor);

      if (church.dominio_customizado) {
        await provider.removeDomain(church.dominio_customizado).catch(() => {
          // Se o provedor falhar, ainda assim soltamos o domínio do nosso lado:
          // segurar a linha impediria a igreja de cadastrar outro.
        });
      }

      await repo.clear(churchId);

      return buildView({
        ...church,
        dominio_customizado: null,
        dominio_status: "nao_configurado",
        dominio_verificacao: null,
        dominio_verificado_em: null,
        dominio_ultimo_erro: null,
      });
    },

    /**
     * Passe do job: consulta o provedor para cada domínio pendente e atualiza.
     * Um domínio com problema nunca derruba o lote — o erro é registrado na
     * linha dele e o passe continua.
     */
    async runVerificationSweep(limit = 25): Promise<{
      checked: number;
      activated: number;
      failed: number;
    }> {
      const pending = await statusWriter.listPendingVerification(limit);
      let activated = 0;
      let failed = 0;

      for (const item of pending) {
        if (!item.dominio_customizado) continue;

        try {
          const state = await provider.verifyDomain(item.dominio_customizado);
          const { status } = resolveDomainStatus(state);

          if (status === "ativo") {
            await statusWriter.applyStatus(item.id, {
              status: "ativo",
              challenges: [],
              error: null,
              verifiedAt: now().toISOString(),
            });
            activated += 1;
            continue;
          }

          if (isPastDeadline(item.dominio_solicitado_em, now())) {
            await statusWriter.applyStatus(item.id, {
              status: "erro",
              challenges: state.challenges,
              error: `O DNS não foi apontado em ${PENDING_DEADLINE_DAYS} dias. Revise os registros e peça uma nova verificação.`,
            });
            failed += 1;
            continue;
          }

          await statusWriter.applyStatus(item.id, {
            status: "pendente_dns",
            challenges: state.challenges,
            error: null,
          });
        } catch (err) {
          failed += 1;
          await statusWriter
            .applyStatus(item.id, {
              status: item.dominio_status,
              error: "A última verificação falhou. Vamos tentar de novo automaticamente.",
            })
            .catch(() => {});
          console.error("[domain-sweep] falha ao verificar domínio", {
            churchId: item.id,
            err,
          });
        }
      }

      return { checked: pending.length, activated, failed };
    },
  };
}

export function isPastDeadline(requestedAt: string | null, now: Date): boolean {
  if (!requestedAt) return false;
  const elapsedMs = now.getTime() - new Date(requestedAt).getTime();
  return elapsedMs > PENDING_DEADLINE_DAYS * 24 * 60 * 60 * 1000;
}

export type ChurchDomainService = ReturnType<typeof createChurchDomainService>;
