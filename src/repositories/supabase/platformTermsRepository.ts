import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import type { PlatformTermsRepository, TermosVigentes, VersaoDosTermos } from "@/services/platformTermsService";

/**
 * Termos pela moderação da plataforma. Ler é público (os termos são um
 * documento aberto); publicar passa pela função do banco, que confere
 * `is_platform_staff` e registra quem publicou.
 */

interface Linha {
  id: string;
  version: number;
  published_at: string;
  is_current: boolean;
}

const versao = (r: Linha): VersaoDosTermos => ({
  id: r.id,
  version: r.version,
  publishedAt: r.published_at,
  isCurrent: r.is_current,
});

export function createSupabasePlatformTermsRepository(client: SupabaseClient): PlatformTermsRepository {
  return {
    async vigente(audience) {
      const { data, error } = await client
        .from("terms_versions")
        .select("id, version, published_at, is_current, content")
        .eq("audience", audience)
        .eq("is_current", true)
        .maybeSingle<Linha & { content: string }>();
      if (error) throw new AppError("internal_error", "Falha ao carregar os termos", error);
      return data ? ({ ...versao(data), content: data.content } satisfies TermosVigentes) : null;
    },

    async historico(audience) {
      const { data, error } = await client
        .from("terms_versions")
        .select("id, version, published_at, is_current")
        .eq("audience", audience)
        .order("version", { ascending: false })
        .returns<Linha[]>();
      if (error) throw new AppError("internal_error", "Falha ao carregar o histórico dos termos", error);
      return (data ?? []).map(versao);
    },

    async publicar(audience, content, versaoEsperada) {
      const { data, error } = await client.rpc("platform_publicar_termos", {
        p_audience: audience,
        p_content: content,
        p_versao_esperada: versaoEsperada,
      });
      if (error) {
        if (error.code === "42501") throw new AppError("forbidden", "Só a moderação da plataforma publica os termos.");
        if (error.code === "40001") {
          throw new AppError(
            "validation_error",
            "Outra versão foi publicada enquanto você editava. Recarregue a página e confira o texto antes de publicar.",
          );
        }
        if (error.code === "23514" || error.code === "22023") {
          throw new AppError("validation_error", "Confira o texto dos termos.");
        }
        throw new AppError("internal_error", "Falha ao publicar os termos", error);
      }
      return data as number;
    },
  };
}
