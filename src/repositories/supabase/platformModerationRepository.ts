import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PlatformModerationRepository } from "@/services/platformModerationService";
import type { PendingProfileChange } from "@/types/sponsorship";

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
