import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { pixJaDecidido, type PixModeracaoRepository, type PixPendente } from "@/services/pixModeracaoService";

interface Linha {
  church_id: string;
  church_name: string;
  public_code: string;
  address: string | null;
  pagina_ativa: boolean;
  pix_chave: string;
  pix_titular: string | null;
  pix_enviado_em: string | null;
  igreja_criada_em: string;
}

/**
 * Fila do Pix para a moderação. Só RPCs: a moderação não tem SELECT nas
 * tabelas das igrejas, e as duas funções conferem `is_platform_staff()`.
 */
export function createSupabasePixModeracaoRepository(client: SupabaseClient): PixModeracaoRepository {
  return {
    async listPendentes(): Promise<PixPendente[]> {
      const { data, error } = await client.rpc("platform_list_pix_pendentes");
      if (error) throw new AppError("internal_error", "Falha ao carregar as chaves Pix pendentes", error);
      return ((data ?? []) as Linha[]).map((r) => ({
        churchId: r.church_id,
        churchName: r.church_name,
        publicCode: r.public_code,
        address: r.address,
        paginaAtiva: r.pagina_ativa,
        pixChave: r.pix_chave,
        pixTitular: r.pix_titular,
        enviadoEm: r.pix_enviado_em,
        igrejaCriadaEm: r.igreja_criada_em,
      }));
    },

    async decidir({ churchId, aprovar, motivo }) {
      const { error } = await client.rpc("platform_decidir_pix", {
        p_church_id: churchId,
        p_aprovar: aprovar,
        p_motivo: motivo,
      });
      if (!error) return;
      if (error.code === "P0002") throw pixJaDecidido(error);
      if (error.code === "42501") throw new AppError("forbidden", "Só a moderação decide sobre a chave Pix.", error);
      throw new AppError("internal_error", "Falha ao registrar a decisão", error);
    },
  };
}
