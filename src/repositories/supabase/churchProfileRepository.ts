import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { DEFAULT_CHURCH_THEME, isChurchTheme, type ChurchTheme } from "@/lib/pageAppearance";
import type {
  ChurchProfile,
  ChurchProfileRepository,
  PageAppearance,
} from "@/services/churchProfileService";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

function temaOuPadrao(slug: string | null | undefined): ChurchTheme {
  return isChurchTheme(slug) ? slug : DEFAULT_CHURCH_THEME;
}

/**
 * Página da igreja. O client do usuário basta: `churches` tem GRANT por
 * COLUNA e a policy exige admin da empresa dona. O filtro por company_id vai
 * junto de toda escrita, como manda o CLAUDE.md.
 */
export function createSupabaseChurchProfileRepository(
  client: SupabaseClient,
): ChurchProfileRepository {
  /** id do tema -> slug. São três linhas; uma consulta por chamada basta. */
  async function slugsDosTemas(): Promise<Map<string, string>> {
    const { data, error } = await client.from("templates").select("id, slug");
    if (error) throw new AppError("internal_error", "Falha ao carregar os temas", error);
    return new Map(((data ?? []) as Array<{ id: string; slug: string }>).map((t) => [t.id, t.slug]));
  }

  /** O que a igreja `churchId` mostra, já com a herança resolvida pelo banco. */
  async function aparenciaResolvida(
    churchId: string,
    slugs: Map<string, string>,
  ): Promise<PageAppearance> {
    const { data, error } = await client.rpc("resolve_church_appearance", {
      p_church_id: churchId,
    });
    if (error) throw new AppError("internal_error", "Falha ao resolver a aparência", error);
    const linha = ((data ?? []) as Array<{ template_id: string; accent_color: string | null }>)[0];
    if (!linha) return { theme: DEFAULT_CHURCH_THEME, accent: null };
    return { theme: temaOuPadrao(slugs.get(linha.template_id)), accent: linha.accent_color };
  }

  return {
    async listCompanyChurches(companyId): Promise<ChurchProfile[]> {
      const { data, error } = await client
        .from("churches")
        .select(
          "id, name, nome_proprio, sobrenome, herdar_nome, public_code, address, logo_url, social_links, parent_id, template_mode, template_id, accent_color",
        )
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new AppError("internal_error", "Falha ao carregar as igrejas", error);

      const slugs = await slugsDosTemas();
      const linhas = (data ?? []) as Array<{
        id: string;
        name: string;
        nome_proprio: string;
        sobrenome: string | null;
        herdar_nome: boolean;
        public_code: string;
        address: string | null;
        logo_url: string | null;
        social_links: Record<string, string> | null;
        parent_id: string | null;
        template_mode: "inherit" | "custom";
        template_id: string | null;
        accent_color: string | null;
      }>;

      // Nome da igreja superior direta, para o "usar o nome de ...". Uma consulta só.
      const idsDasMaes = [...new Set(linhas.map((l) => l.parent_id).filter((id): id is string => id !== null))];
      const nomesDasMaes = new Map<string, string>();
      if (idsDasMaes.length > 0) {
        const { data: maes, error: erroMaes } = await client
          .from("churches")
          .select("id, name")
          .in("id", idsDasMaes);
        if (erroMaes) throw new AppError("internal_error", "Falha ao carregar a igreja superior", erroMaes);
        for (const mae of (maes ?? []) as Array<{ id: string; name: string }>) nomesDasMaes.set(mae.id, mae.name);
      }

      return Promise.all(
        linhas.map(async (row): Promise<ChurchProfile> => ({
          id: row.id,
          name: row.name,
          nomeProprio: row.nome_proprio,
          sobrenome: row.sobrenome,
          herdarNome: row.herdar_nome,
          parentName: row.parent_id ? (nomesDasMaes.get(row.parent_id) ?? null) : null,
          publicCode: row.public_code,
          address: row.address,
          logoUrl: row.logo_url,
          socialLinks: row.social_links ?? {},
          hasParent: row.parent_id !== null,
          appearanceMode: row.template_mode === "custom" ? "custom" : "inherit",
          own: {
            theme: temaOuPadrao(row.template_id ? slugs.get(row.template_id) : null),
            accent: row.accent_color,
          },
          inherited: row.parent_id ? await aparenciaResolvida(row.parent_id, slugs) : null,
        })),
      );
    },

    async updateProfile({
      churchId,
      companyId,
      nomeProprio,
      sobrenome,
      herdarNome,
      address,
      publicCode,
      socialLinks,
    }) {
      const { error } = await client
        .from("churches")
        .update({
          // `name` (o nome que aparece) é derivado pelo banco a partir destes.
          nome_proprio: nomeProprio,
          sobrenome,
          herdar_nome: herdarNome,
          address,
          public_code: publicCode,
          social_links: socialLinks,
        })
        .eq("id", churchId)
        .eq("company_id", companyId);
      if (!error) return;
      if (error.code === UNIQUE_VIOLATION) {
        throw new AppError(
          "conflict",
          "Esse endereço já é de outra igreja. Escolha outro — por exemplo com o nome da cidade.",
          error,
        );
      }
      if (error.code === CHECK_VIOLATION) {
        throw new AppError("validation_error", "Endereço público em formato inválido.", error);
      }
      throw new AppError("internal_error", "Falha ao salvar a página da igreja", error);
    },

    async updateLogo({ churchId, companyId, logoUrl }) {
      const { error } = await client
        .from("churches")
        .update({ logo_url: logoUrl })
        .eq("id", churchId)
        .eq("company_id", companyId);
      if (error) throw new AppError("internal_error", "Falha ao salvar o logo", error);
    },

    async updateAppearance({ churchId, companyId, mode, theme, accent }) {
      let templateId: string | null = null;
      if (mode === "custom") {
        const { data, error } = await client
          .from("templates")
          .select("id")
          .eq("slug", theme)
          .maybeSingle<{ id: string }>();
        if (error || !data) {
          throw new AppError("internal_error", "Esse tema não está disponível.", error);
        }
        templateId = data.id;
      }

      const { error } = await client
        .from("churches")
        .update({
          template_mode: mode,
          template_id: templateId,
          // A cor anda com o tema: ao voltar a herdar, some junto.
          accent_color: mode === "custom" ? accent : null,
        })
        .eq("id", churchId)
        .eq("company_id", companyId);
      if (!error) return;
      if (error.code === CHECK_VIOLATION) {
        throw new AppError("validation_error", "Cor em formato inválido.", error);
      }
      throw new AppError("internal_error", "Falha ao salvar a aparência da página", error);
    },
  };
}
