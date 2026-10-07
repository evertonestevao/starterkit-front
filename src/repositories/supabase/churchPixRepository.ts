import type { SupabaseClient } from "@supabase/supabase-js";
import { statusDoPix } from "@/lib/pixStatus";
import { AppError } from "@/lib/errors";
import type { ChurchPixRepository, PixConfirmacaoEstado } from "@/services/churchPixService";

/**
 * Chave PIX da igreja. O client do usuário basta: `churches` tem GRANT de
 * update só nas colunas certas e a policy exige admin da empresa dona. O
 * filtro por company_id é repetido aqui, como manda o CLAUDE.md.
 *
 * `admin` (service_role) entra só para CRIAR o pedido de confirmação: essa
 * função não é executável pelo usuário, de propósito. Quem monta o
 * repositório é `src/server`, depois de o service conferir a permissão.
 */
export function createSupabaseChurchPixRepository(client: SupabaseClient, admin?: SupabaseClient): ChurchPixRepository {
  return {
    async listCompanyChurches(companyId) {
      const { data, error } = await client
        .from("churches")
        .select("id, name, pix_chave, pix_titular, pix_aprovado_em, pix_recusado_em, pix_recusa_motivo")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);
      return (
        (data ?? []) as Array<{
          id: string;
          name: string;
          pix_chave: string | null;
          pix_titular: string | null;
          pix_aprovado_em: string | null;
          pix_recusado_em: string | null;
          pix_recusa_motivo: string | null;
        }>
      ).map((row) => ({
        id: row.id,
        name: row.name,
        pixChave: row.pix_chave,
        pixTitular: row.pix_titular,
        pixStatus: statusDoPix({
          chave: row.pix_chave,
          aprovadoEm: row.pix_aprovado_em,
          recusadoEm: row.pix_recusado_em,
        }),
        pixMotivoRecusa: row.pix_recusa_motivo,
      }));
    },

    async updatePix({ churchId, companyId, chave, titular }) {
      const { error } = await client
        .from("churches")
        .update({ pix_chave: chave, pix_titular: titular })
        .eq("id", churchId)
        .eq("company_id", companyId);
      if (error) throw new AppError("internal_error", "Falha ao salvar a chave PIX", error);
    },

    async listCompanyAdminEmails(companyId) {
      const { data, error } = await client.rpc("company_admin_emails", { p_company_id: companyId });
      if (error) throw new AppError("internal_error", "Falha ao carregar os administradores", error);
      return ((data ?? []) as Array<{ email: string }>).map((row) => row.email);
    },

    async criarConfirmacao({ churchId, tokenHash, solicitadoPor, validadeHoras }) {
      if (!admin) throw new AppError("internal_error", "Confirmação por e-mail indisponível");
      const { data, error } = await admin.rpc("pix_criar_confirmacao", {
        p_church_id: churchId,
        p_token_hash: tokenHash,
        p_solicitado_por: solicitadoPor,
        p_validade_horas: validadeHoras,
      });
      if (error) throw new AppError("internal_error", "Falha ao criar o pedido de confirmação", error);
      return ((data ?? []) as Array<{ email: string }>).map((row) => row.email);
    },

    async confirmacaoPorToken(token) {
      const { data, error } = await client.rpc("pix_confirmacao_por_token", { p_token: token });
      if (error) throw new AppError("internal_error", "Falha ao abrir o link de confirmação", error);
      const row = (
        (data ?? []) as Array<{
          estado: PixConfirmacaoEstado;
          church_name: string;
          pix_chave: string | null;
          pix_titular: string | null;
        }>
      )[0];
      if (!row) return null;
      return { estado: row.estado, churchName: row.church_name, chave: row.pix_chave, titular: row.pix_titular };
    },

    async confirmarPorToken(token) {
      const { data, error } = await client.rpc("pix_confirmar_por_token", { p_token: token });
      if (error) {
        if (error.code === "P0002") throw new AppError("not_found", "Este link de confirmação não vale mais.");
        throw new AppError("internal_error", "Falha ao confirmar a chave PIX", error);
      }
      const row = ((data ?? []) as Array<{ church_name: string; public_code: string }>)[0];
      if (!row) throw new AppError("not_found", "Este link de confirmação não vale mais.");
      return { churchName: row.church_name, publicCode: row.public_code };
    },
  };
}
