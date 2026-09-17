import { notFound } from "next/navigation";
import { ChurchPageRenderer } from "@/features/church/church-page-templates";
import { createSupabasePublicChurchRepository } from "@/repositories/supabase/churchRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";

export default async function PublicChurchPage({
  params,
}: {
  params: Promise<{ public_code: string }>;
}) {
  const { public_code } = await params;
  const supabase = await getSupabaseServerClient();

  // Colunas explícitas: o anon não tem GRANT nas colunas de domínio.
  const church = await createSupabasePublicChurchRepository(supabase).findByPublicCode(
    public_code,
  );

  if (!church) {
    notFound();
  }

  const { data: templateId } = await supabase.rpc("resolve_template", {
    p_church_id: church.id,
  });

  const { data: template } = templateId
    ? await supabase
        .from("templates")
        .select("*")
        .eq("id", templateId)
        .maybeSingle()
    : { data: null };

  // Vitrine sai dos patrocínios pagos em vigor (a tabela antiga foi removida).
  const sponsors = await createSupabasePublicChurchRepository(supabase)
    .listPublicSponsors(church.id)
    .catch((err: unknown) => {
      // Vitrine vazia não pode derrubar a página da igreja.
      console.error("[church-page] falha ao carregar patrocinadores", err);
      return [];
    });

  const templateSlug =
    template?.slug === "classico" ||
    template?.slug === "clean" ||
    template?.slug === "dark"
      ? template.slug
      : "dark";

  return (
    <ChurchPageRenderer
      church={church}
      sponsors={sponsors}
      templateSlug={templateSlug}
      staticPix="PIX Tag Igreja: 00000.00000.00000.00000"
    />
  );
}
