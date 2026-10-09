import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { CadastroConviteRepository, ConviteIgreja } from "@/services/cadastroConviteService";

/** Funções da plataforma (security definer; o banco exige platform_staff). */
export function createSupabaseCadastroConviteRepository(client: SupabaseClient): CadastroConviteRepository {
  function falha(mensagem: string, error: { code?: string }): never {
    if (error.code === "42501") throw new AppError("forbidden", "Só a plataforma faz isso.", error);
    throw new AppError("internal_error", mensagem, error);
  }

  return {
    async cadastroAberto() {
      const { data, error } = await client.rpc("cadastro_aberto");
      if (error) falha("Falha ao ler o cadastro", error);
      return data === true;
    },

    async definirCadastroAberto(aberto) {
      const { error } = await client.rpc("platform_definir_cadastro_aberto", { p_aberto: aberto });
      if (error) falha("Falha ao mudar o cadastro", error);
    },

    async criarConvite({ tokenHash, descricao, validadeDias }) {
      const { data, error } = await client.rpc("platform_criar_convite_igreja", {
        p_token_hash: tokenHash,
        p_descricao: descricao,
        p_validade_dias: validadeDias,
      });
      if (error) falha("Falha ao gerar o convite", error);
      return data as string;
    },

    async listarConvites() {
      const { data, error } = await client.rpc("platform_convites_igreja");
      if (error) falha("Falha ao carregar os convites", error);
      return ((data ?? []) as Array<Record<string, unknown>>).map(
        (r): ConviteIgreja => ({
          id: r.id as string,
          descricao: r.descricao as string,
          criadoEm: r.created_at as string,
          expiraEm: r.expires_at as string,
          revogadoEm: (r.revoked_at as string | null) ?? null,
          usadoEm: (r.used_at as string | null) ?? null,
          igreja: (r.igreja as string | null) ?? null,
        }),
      );
    },

    async revogarConvite(id) {
      const { error } = await client.rpc("platform_revogar_convite_igreja", { p_id: id });
      if (error) falha("Falha ao cancelar o convite", error);
    },
  };
}
