import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { SponsorLinkKind } from "@/lib/sponsorLink";
import type {
  SponsorProfileAccount,
  SponsorProfileRepository,
} from "@/services/sponsorProfileService";
import type { SponsorProfileChange } from "@/types/sponsorship";

/**
 * Alterações de perfil do patrocinador.
 *
 * `display_name`, `logo_url` e `link_*` não têm mais GRANT de update para
 * `authenticated` (migration 20260918120000): a escrita passa obrigatoriamente
 * pelas RPCs abaixo, que registram o pedido em vez de aplicar. Um update
 * direto aqui voltaria a expor a página pública da igreja.
 */
export function createSupabaseSponsorProfileRepository(
  client: SupabaseClient,
): SponsorProfileRepository {
  async function currentAccountId(): Promise<string> {
    const account = await repo.getMyAccount();
    if (!account) throw new AppError("not_found", "Cadastro de patrocinador não encontrado.");
    return account.id;
  }

  const repo: SponsorProfileRepository = {
    async getMyAccount(): Promise<SponsorProfileAccount | null> {
      const { data, error } = await client
        .from("sponsor_accounts")
        .select("id, user_id, display_name, logo_url, link_tipo, link_valor, email, security_hold_at")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar o cadastro", error);
      }
      if (!data) return null;
      return {
        id: data.id as string,
        userId: data.user_id as string,
        displayName: data.display_name as string,
        logoUrl: (data.logo_url as string | null) ?? null,
        link:
          data.link_tipo && data.link_valor
            ? { tipo: data.link_tipo as SponsorLinkKind, valor: data.link_valor as string }
            : null,
        email: data.email as string,
        securityHoldAt: (data.security_hold_at as string | null) ?? null,
      };
    },

    async getMyPendingChange(): Promise<SponsorProfileChange | null> {
      const { data, error } = await client
        .from("sponsor_profile_changes")
        .select(
          "id, novo_display_name, novo_logo_path, novo_link_alterado, novo_link_tipo, novo_link_valor, anterior_display_name, anterior_logo_url, status, motivo_recusa, created_at, decided_at",
        )
        .eq("status", "pendente")
        .maybeSingle();
      if (error) {
        throw new AppError("internal_error", "Falha ao carregar a alteração pendente", error);
      }
      return (data as SponsorProfileChange | null) ?? null;
    },

    async requestChange({ displayName, logoPath, link, tokenHash, expiresAt }) {
      const { data, error } = await client.rpc("request_sponsor_profile_change", {
        p_display_name: displayName,
        p_logo_path: logoPath,
        p_token_hash: tokenHash,
        p_token_expira: expiresAt,
        p_link_alterado: link !== null,
        p_link_tipo: link?.value?.tipo ?? null,
        p_link_valor: link?.value?.valor ?? null,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao registrar a alteração", error);
      }
      return data as string;
    },

    async cancelByToken(tokenHash) {
      const { data, error } = await client.rpc("cancel_profile_change_by_token", {
        p_token_hash: tokenHash,
      });
      if (error) {
        throw new AppError("internal_error", "Falha ao desfazer a alteração", error);
      }
      return Boolean(data);
    },

    async updatePhone(phone) {
      const { error } = await client
        .from("sponsor_accounts")
        .update({ phone })
        .eq("id", await currentAccountId());
      if (error) {
        throw new AppError("internal_error", "Falha ao salvar o telefone", error);
      }
    },

    async updateVisibility(visible) {
      const { error } = await client
        .from("sponsor_accounts")
        .update({ visible_on_page: visible })
        .eq("id", await currentAccountId());
      if (error) {
        throw new AppError("internal_error", "Falha ao salvar a visibilidade", error);
      }
    },
  };

  return repo;
}
