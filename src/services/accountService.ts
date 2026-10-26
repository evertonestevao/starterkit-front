import { AppError } from "@/lib/errors";
import type { RateLimiter } from "@/server/rateLimit";
import type { AccountMembership, MyDataExport } from "@/types/account";
import type { SubscriptionStatus } from "@/types/database";

/**
 * Direitos do titular (LGPD, art. 18): exportar os próprios dados e excluir a
 * conta. A exclusão nunca deixa empresa órfã: owner de empresa com outros
 * membros precisa transferir antes; empresa só dele é encerrada junto.
 */

export interface AccountRepository {
  getCurrentUser(): Promise<{ id: string; email: string; createdAt: string } | null>;
  listMyMemberships(): Promise<AccountMembership[]>;
  /** Soft delete da empresa (deleted_at). */
  closeCompany(companyId: string): Promise<void>;
  collectMyData(): Promise<Omit<MyDataExport, "exportedAt" | "account">>;
}

/** Exclusão definitiva do usuário (auth + arquivos). Exige service_role. */
export interface AccountRemover {
  deleteUser(userId: string): Promise<void>;
}

export interface AccountAuditor {
  record(entry: { companyId: string; userId: string; action: string }): Promise<void>;
}

interface AccountServiceDeps {
  repo: AccountRepository;
  remover: AccountRemover;
  audit: AccountAuditor;
  rateLimiter: RateLimiter;
  now?: () => Date;
}

/** Assinatura que ainda gera ou pode gerar cobrança. */
const BILLABLE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
  "past_due",
]);

export interface AccountDeletionPlan {
  /** Motivos que impedem a exclusão agora (mensagens para o usuário). */
  blockers: string[];
  /** Empresas só do usuário: encerradas junto com a conta. */
  companiesToClose: AccountMembership[];
  /** Empresas que continuam: recebem registro de auditoria da saída. */
  companiesToLeave: AccountMembership[];
}

/** Decide o que acontece com cada empresa do usuário. Pura e testável. */
export function planAccountDeletion(memberships: AccountMembership[]): AccountDeletionPlan {
  const plan: AccountDeletionPlan = { blockers: [], companiesToClose: [], companiesToLeave: [] };
  for (const membership of memberships) {
    if (membership.role !== "owner") {
      plan.companiesToLeave.push(membership);
      continue;
    }
    if (membership.activeMembers > 1) {
      plan.blockers.push(
        `Transfira a propriedade de "${membership.companyName}" para outro membro.`,
      );
      continue;
    }
    if (membership.subscriptionStatus && BILLABLE_STATUSES.has(membership.subscriptionStatus)) {
      plan.blockers.push(`Cancele a assinatura de "${membership.companyName}".`);
      continue;
    }
    plan.companiesToClose.push(membership);
  }
  return plan;
}

export function createAccountService({
  repo,
  remover,
  audit,
  rateLimiter,
  now = () => new Date(),
}: AccountServiceDeps) {
  async function requireUser() {
    const user = await repo.getCurrentUser();
    if (!user) {
      throw new AppError("unauthorized", "Sessão expirada");
    }
    return user;
  }

  async function getDeletionPlan(): Promise<AccountDeletionPlan> {
    await requireUser();
    return planAccountDeletion(await repo.listMyMemberships());
  }

  /** Exclui a conta. `confirmation` precisa ser o email do próprio usuário. */
  async function deleteMyAccount(input: { confirmation: unknown }): Promise<void> {
    const user = await requireUser();
    await rateLimiter.consume(`account-delete:${user.id}`);

    const confirmation =
      typeof input.confirmation === "string" ? input.confirmation.trim().toLowerCase() : "";
    if (!confirmation || confirmation !== user.email.toLowerCase()) {
      throw new AppError("validation_error", "Digite seu email para confirmar a exclusão");
    }

    const plan = planAccountDeletion(await repo.listMyMemberships());
    if (plan.blockers.length > 0) {
      throw new AppError("validation_error", plan.blockers.join(" "));
    }

    // Auditoria ANTES: depois da exclusão a RLS já não deixa gravar.
    for (const membership of plan.companiesToLeave) {
      await audit.record({
        companyId: membership.companyId,
        userId: user.id,
        action: "member.account_deleted",
      });
    }
    for (const membership of plan.companiesToClose) {
      await audit.record({
        companyId: membership.companyId,
        userId: user.id,
        action: "company.closed",
      });
      await repo.closeCompany(membership.companyId);
    }

    await remover.deleteUser(user.id);
  }

  /** Dados pessoais do usuário logado em formato portável (JSON). */
  async function exportMyData(): Promise<MyDataExport> {
    const user = await requireUser();
    await rateLimiter.consume(`account-export:${user.id}`);
    const data = await repo.collectMyData();
    return { exportedAt: now().toISOString(), account: user, ...data };
  }

  return { getDeletionPlan, deleteMyAccount, exportMyData };
}

export type AccountService = ReturnType<typeof createAccountService>;
