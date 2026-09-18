import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { templatePreviewOptions } from "@/features/church/church-page-templates";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { updateChurchTemplateAction } from "@/server/actions/church";

export default async function ChurchTemplateAdminPage({
  params,
}: {
  params: Promise<{ church_id: string }>;
}) {
  const { church_id } = await params;

  // Página herdada do começo do projeto: não está linkada em lugar nenhum e
  // ainda fala com o Supabase daqui, contra a regra de camadas do projeto. O
  // lugar dela é dentro de /dashboard/settings. Até lá, ao menos não abre a
  // igreja de outra empresa para quem estiver logado.
  const { active } = await getActiveTenant();
  if (!active || (active.role !== "owner" && active.role !== "admin")) notFound();

  const supabase = await getSupabaseServerClient();
  const { data: church } = await supabase
    .from("churches")
    .select("*")
    .eq("id", church_id)
    .eq("company_id", active.id)
    .maybeSingle();
  if (!church) notFound();

  const { data: templates } = await supabase.from("templates").select("*");

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Admin
        </p>
        <h1 className="text-3xl font-semibold">Template da igreja</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {templatePreviewOptions.map((template) => (
          <div key={template.slug} className="rounded-2xl border bg-card p-4">
            <div className="mb-3 rounded-xl border bg-muted p-3 text-sm">
              <p className="font-medium">{template.label}</p>
              <p className="text-xs text-muted-foreground">{template.hint}</p>
            </div>
            <div className="rounded-xl border bg-background p-3 text-xs text-muted-foreground">
              Preview do template {template.label}
            </div>
            <form
              action={updateChurchTemplateAction.bind(null, church.id)}
              className="mt-4 flex flex-col gap-2"
            >
              <input type="hidden" name="template_mode" value="custom" />
              <input
                type="hidden"
                name="template_id"
                value={
                  templates?.find((item) => item.slug === template.slug)?.id ??
                  ""
                }
              />
              <Button
                type="submit"
                variant={
                  church.template_mode === "custom" &&
                  church.template_id ===
                    (templates?.find((item) => item.slug === template.slug)
                      ?.id ?? "")
                    ? "default"
                    : "outline"
                }
              >
                {church.template_mode === "custom" &&
                church.template_id ===
                  (templates?.find((item) => item.slug === template.slug)?.id ??
                    "")
                  ? "Selecionado"
                  : "Usar este template"}
              </Button>
            </form>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Modo de herança</h2>
        <form
          action={updateChurchTemplateAction.bind(null, church.id)}
          className="mt-3 flex flex-col gap-3 md:flex-row md:items-center"
        >
          <input
            type="hidden"
            name="template_id"
            value={church.template_id ?? ""}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="template_mode"
              value="inherit"
              defaultChecked={church.template_mode === "inherit"}
            />
            Herdar da sede
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="template_mode"
              value="custom"
              defaultChecked={church.template_mode === "custom"}
            />
            Usar template próprio
          </label>
          <Button type="submit">Salvar</Button>
        </form>
      </div>
    </main>
  );
}
