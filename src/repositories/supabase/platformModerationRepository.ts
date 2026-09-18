import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PlatformModerationRepository } from "@/services/platformModerationService";
import type {
  AbuseReport,
  HiddenSignal,
  PendingProfileChange,
  SecurityHold,
} from "@/types/sponsorship";

interface PendingRow {
  id: string;
  sponsor_account_id: string;
  sponsor_email: string;
  novo_display_name: string | null;
  novo_logo_path: string | null;
  atual_display_name: string;
  atual_logo_url: string | null;
  igrejas: number;
  created_at: string;
}

/**
 * Fila da moderação. Tudo por RPC `security definer`: o staff não tem (nem
 * deve ter) SELECT direto em `sponsor_accounts` nem nas tabelas das igrejas.
 * As próprias RPCs checam `is_platform_staff()`.
 *
 * `adminClient` é usado só para ler a lista de emails do staff, que serve
 * para avisar a fila — `platform_staff` não tem GRANT para `authenticated`.
 */
export function createSupabasePlatformModerationRepository(
  client: SupabaseClient,
  adminClient: SupabaseClient,
): PlatformModerationRepository {
  return {
    async listPendingProfileChanges(): Promise<PendingProfileChange[]> {
      const { data, error } = await client.rpc("list_pending_profile_changes");
      if (error) {
        throw new AppError("internal_error", "Falha ao listar as alterações", error);
      }
      return ((data ?? []) as PendingRow[]).map((row) => ({
        id: row.id,
        sponsorAccountId: row.sponsor_account_id,
        sponsorEmail: row.sponsor_email,
        novoDisplayName: row.novo_display_name,
        novoLogoPath: row.novo_logo_path,
        atualDisplayName: row.atual_display_name,
        atualLogoUrl: row.atual_logo_url,
        igrejas: row.igrejas,
        createdAt: row.created_at,
      }));
    },

    async reviewProfileChange({ changeId, approved, reason, via, logoUrl }) {
      const { data, error } = await client.rpc("review_profile_change", {
        p_change_id: changeId,
        p_aprovada: approved,
        p_motivo: reason,
        p_via: via,
        p_logo_url: logoUrl,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao registrar a decisão", error);
      }
      return Boolean(data);
    },

    async listAbuseReports(): Promise<AbuseReport[]> {
      const { data, error } = await client.rpc("list_abuse_reports");
      if (error) {
        throw new AppError("internal_error", "Falha ao listar as denúncias", error);
      }
      return ((data ?? []) as Array<{
        id: string;
        sponsorship_id: string;
        church_name: string;
        sponsor_name: string;
        sponsor_email: string;
        logo_url: string | null;
        motivo: string;
        created_at: string;
      }>).map((row) => ({
        id: row.id,
        sponsorshipId: row.sponsorship_id,
        churchName: row.church_name,
        sponsorName: row.sponsor_name,
        sponsorEmail: row.sponsor_email,
        logoUrl: row.logo_url,
        motivo: row.motivo,
        createdAt: row.created_at,
      }));
    },

    async reviewAbuseReport({ reportId, procedente, nota, via }) {
      const { data, error } = await client.rpc("review_abuse_report", {
        p_report_id: reportId,
        p_procedente: procedente,
        p_nota: nota,
        p_via: via,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao registrar a decisão", error);
      }
      return Boolean(data);
    },

    async listHiddenSignals(): Promise<HiddenSignal[]> {
      const { data, error } = await client.rpc("list_hidden_signals");
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar os sinais", error);
      }
      return ((data ?? []) as Array<{
        sponsor_account_id: string;
        sponsor_name: string;
        sponsor_email: string;
        igrejas_que_esconderam: number;
      }>).map((row) => ({
        sponsorAccountId: row.sponsor_account_id,
        sponsorName: row.sponsor_name,
        sponsorEmail: row.sponsor_email,
        igrejasQueEsconderam: row.igrejas_que_esconderam,
      }));
    },

    async listSecurityHolds(): Promise<SecurityHold[]> {
      const { data, error } = await client.rpc("list_security_holds");
      if (error) {
        throw new AppError("internal_error", "Falha ao listar contas bloqueadas", error);
      }
      return ((data ?? []) as Array<{
        sponsor_account_id: string;
        display_name: string;
        email: string;
        security_hold_at: string;
        ultima_tentativa_nome: string | null;
        ultima_tentativa_em: string | null;
      }>).map((row) => ({
        sponsorAccountId: row.sponsor_account_id,
        displayName: row.display_name,
        email: row.email,
        securityHoldAt: row.security_hold_at,
        ultimaTentativaNome: row.ultima_tentativa_nome,
        ultimaTentativaEm: row.ultima_tentativa_em,
      }));
    },

    async releaseSecurityHold({ sponsorAccountId, via }) {
      const { data, error } = await client.rpc("release_sponsor_security_hold", {
        p_sponsor_account_id: sponsorAccountId,
        p_via: via,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao liberar a conta", error);
      }
      return Boolean(data);
    },

    async listStaffEmails(): Promise<string[]> {
      const { data, error } = await adminClient
        .from("platform_staff")
        .select("email")
        .is("deleted_at", null);
      if (error) {
        throw new AppError("internal_error", "Falha ao listar a moderação", error);
      }
      return ((data ?? []) as Array<{ email: string }>).map((row) => row.email);
    },
  };
}
