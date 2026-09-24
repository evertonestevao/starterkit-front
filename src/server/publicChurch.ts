import "server-only";
import { cache } from "react";
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
  ): Promise<{ church: PublicChurch; theme: ChurchTheme; accent: string | null } | null> => {
    const repo = createSupabasePublicChurchRepository(await getSupabaseServerClient());
    const church = await repo.findByPublicCode(publicCode);
    if (!church) return null;

    const { slug, accent } = await repo.resolveAppearance(church.id);
    const theme = isChurchTheme(slug) ? slug : DEFAULT_CHURCH_THEME;
    return { church, theme, accent };
  },
);

export async function getPublicChurchRepository() {
  return createSupabasePublicChurchRepository(await getSupabaseServerClient());
}
