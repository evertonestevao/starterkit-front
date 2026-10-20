import "server-only";
import { cache } from "react";
import { caminhoDaIgreja, partesDaChave } from "@/lib/churchPaths";
import { createSupabasePublicChurchRepository } from "@/repositories/supabase/churchRepository";
import { DEFAULT_CHURCH_THEME, isChurchTheme, type ChurchTheme } from "@/lib/pageAppearance";
import type { PublicChurch } from "@/types/database";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Carrega a igreja da página pública e a aparência dela (tema e cor de
 * destaque). Em `cache` porque a página, a lista de eventos e o detalhe
 * precisam da mesma coisa, e o mesmo request não deve ir ao banco duas vezes
 * por ela.
 */

export type { ChurchTheme };

export const loadPublicChurch = cache(
  async (
    publicCode: string,
  ): Promise<{ church: PublicChurch; theme: ChurchTheme; accent: string | null; previa: boolean } | null> => {
    const repo = createSupabasePublicChurchRepository(await getSupabaseServerClient());
    const church = await repo.findByPublicCode(publicCode);
    if (!church) return null;

    // Página fora do ar: para o público não existe (o banco nem devolve a
    // linha). Quem administra a igreja a recebe marcada como prévia.
    const { previa } = church;

    const { slug, accent } = await repo.resolveAppearance(church.id);
    const theme = isChurchTheme(slug) ? slug : DEFAULT_CHURCH_THEME;
    return { church, theme, accent, previa };
  },
);

/**
 * Link ou QR Code antigo de uma igreja que mudou de lugar na rede:
 *   - entrou numa rede: /igreja/{codigo} passou a ser /igreja/{rede}/{codigo};
 *   - saiu (ou trocou de rede): /igreja/{rede}/{codigo} passou a ser /igreja/{codigo}.
 * Recebe a chave pedida ("codigo" ou "rede~codigo") e devolve o caminho atual,
 * ou null quando o código não existe ou é de mais de uma igreja (não há o que
 * adivinhar). Falha na consulta não vira erro: a página só responde "não encontrada".
 */
export async function enderecoAtualDoCodigoAntigo(chavePedida: string): Promise<string | null> {
  const { codigo } = partesDaChave(chavePedida);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(codigo)) return null;
  try {
    const repo = createSupabasePublicChurchRepository(await getSupabaseServerClient());
    const chave = await repo.findChaveByCodigoAntigo(codigo);
    return chave && chave !== chavePedida ? caminhoDaIgreja(chave) : null;
  } catch (err) {
    console.error("[church-page] falha ao procurar o endereço antigo", err);
    return null;
  }
}

export async function getPublicChurchRepository() {
  return createSupabasePublicChurchRepository(await getSupabaseServerClient());
}
