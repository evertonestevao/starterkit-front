import "server-only";
import { cache } from "react";
import { createSupabasePublicChurchRepository } from "@/repositories/supabase/churchRepository";
import type { PublicChurch } from "@/types/database";
import { getSupabaseServerClient } from "./supabase-server";

/**
 * Carrega a igreja da página pública e o tema dela. Em `cache` porque a
 * página, a lista de eventos e o detalhe precisam da mesma coisa, e o mesmo
 * request não deve ir ao banco duas vezes por ela.
 */

export type ChurchTheme = "classico" | "clean" | "dark";

const TEMAS: readonly ChurchTheme[] = ["classico", "clean", "dark"];

export const loadPublicChurch = cache(
  async (publicCode: string): Promise<{ church: PublicChurch; theme: ChurchTheme } | null> => {
    const repo = createSupabasePublicChurchRepository(await getSupabaseServerClient());
    const church = await repo.findByPublicCode(publicCode);
    if (!church) return null;

    const slug = await repo.resolveTemplateSlug(church.id);
    const theme = TEMAS.includes(slug as ChurchTheme) ? (slug as ChurchTheme) : "dark";
    return { church, theme };
  },
);

export async function getPublicChurchRepository() {
  return createSupabasePublicChurchRepository(await getSupabaseServerClient());
}
