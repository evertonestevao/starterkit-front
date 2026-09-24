import { formatChurchName } from "@/lib/churchName";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, HandCoins } from "lucide-react";
import { z } from "zod";
import { brand } from "@/config/brand";
import { CampaignDonationForm } from "@/features/campaigns/components/campaign-donation-form";
import { fonteTitulos, PublicShell } from "@/features/church/components/public-shell";
import { normalizeSocialLinks } from "@/lib/churchPublicPage";
import { getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";
import { formatCents } from "@/services/sponsorPricing";

type Params = { params: Promise<{ public_code: string; campaignId: string }> };

/** Id que não é uuid nem chega ao banco — lá viraria erro 500, não 404. */
const campaignIdSchema = z.uuid();

async function carregar(publicCode: string, campaignId: string) {
  if (!campaignIdSchema.safeParse(campaignId).success) return null;
  const igreja = await loadPublicChurch(publicCode);
  if (!igreja) return null;
  // A RLS já só devolve campanha ativa/encerrada; rascunho vira null aqui.
  const campanha = await (await getPublicChurchRepository()).findCampaign(igreja.church.id, campaignId);
  if (!campanha) return null;
  return { ...igreja, campanha };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { public_code, campaignId } = await params;
  const dados = await carregar(public_code, campaignId);
  if (!dados) return { title: "Campanha" };
  return {
    title: `${dados.campanha.titulo} · ${formatChurchName(dados.church.name, dados.church.sobrenome)}`,
    description: dados.campanha.historia.slice(0, 160),
  };
}

export default async function ChurchCampaignPage({ params }: Params) {
  const { public_code, campaignId } = await params;
  const dados = await carregar(public_code, campaignId);
  if (!dados) notFound();
  const { church, theme, accent, campanha } = dados;

  const base = `/igreja/${church.public_code}`;
  const percentual =
    campanha.meta_cents > 0
      ? Math.min(100, Math.round((campanha.total_arrecadado_liquido_cents / campanha.meta_cents) * 100))
      : 0;
  const whatsapp = normalizeSocialLinks(church.social_links).find((r) => r.kind === "whatsapp");
  const aceitaDoacao = campanha.status === "ativa";

  return (
    <PublicShell theme={theme} accent={accent}>
      <header className="bg-[var(--pg-hero)]">
        <div className="mx-auto w-full max-w-xl px-5 pt-6 pb-10">
          <Link
            href={`${base}/campanhas`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--pg-hero-muted)] hover:text-[var(--pg-hero-text)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Todas as campanhas
          </Link>
          <p className="mt-8 text-sm font-medium text-[var(--pg-hero-muted)]">{formatChurchName(church.name, church.sobrenome)}</p>
          <h1
            className={`${fonteTitulos.className} mt-1 text-3xl leading-tight font-bold text-balance text-[var(--pg-hero-text)]`}
          >
            {campanha.titulo}
          </h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-8">
        {campanha.foto_capa_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campanha.foto_capa_url}
            alt={`Capa de ${campanha.titulo}`}
            className="aspect-[2/1] w-full rounded-2xl object-cover"
          />
        ) : null}

        {campanha.mostrar_progresso ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-5">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--pg-band)]">
              <div
                className="h-full rounded-full bg-[var(--pg-accent)] transition-[width]"
                style={{ width: `${percentual}%` }}
              />
            </div>
            <p className="text-sm text-[var(--pg-text)]">
              <strong className="font-semibold">{formatCents(campanha.total_arrecadado_liquido_cents)}</strong> de{" "}
              {formatCents(campanha.meta_cents)} ({percentual}%)
            </p>
          </div>
        ) : null}

        <section>
          <h2 className={`${fonteTitulos.className} text-xl font-bold`}>Sobre o projeto</h2>
          <p className="mt-3 text-base leading-7 whitespace-pre-line text-[var(--pg-text)]">{campanha.historia}</p>
        </section>

        {campanha.status === "encerrada" && (campanha.feedback_texto || campanha.feedback_foto_url) ? (
          <section className="rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-5">
            <h2 className={`${fonteTitulos.className} text-xl font-bold`}>O que foi feito</h2>
            {campanha.feedback_foto_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={campanha.feedback_foto_url}
                alt={`Resultado da campanha ${campanha.titulo}`}
                className="mt-4 aspect-[2/1] w-full rounded-xl object-cover"
              />
            ) : null}
            {campanha.feedback_texto ? (
              <p className="mt-3 text-base leading-7 whitespace-pre-line text-[var(--pg-text)]">
                {campanha.feedback_texto}
              </p>
            ) : null}
          </section>
        ) : null}

        <section id="apoiar" className="rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-5">
          <h2 className={`${fonteTitulos.className} flex items-center gap-2 text-xl font-bold`}>
            <HandCoins className="size-5 shrink-0 text-[var(--pg-accent)]" aria-hidden />
            {aceitaDoacao ? "Apoiar este projeto" : "Campanha encerrada"}
          </h2>
          {aceitaDoacao ? (
            <div className="mt-4">
              <CampaignDonationForm
                campaignId={campanha.id}
                metodoRecebimento={campanha.metodo_recebimento}
                valoresSugeridos={campanha.valores_sugeridos}
                valorPadraoCents={campanha.valor_padrao_cents}
                permitirValorLivre={campanha.permitir_valor_livre}
                whatsappHref={whatsapp?.href ?? null}
              />
            </div>
          ) : (
            <p className="mt-2 text-base leading-7 text-[var(--pg-muted)]">
              Esta campanha não está mais recebendo doações. Obrigado a quem apoiou!
            </p>
          )}
        </section>
      </main>

      <footer className="px-4 pt-2 pb-10 text-center">
        <a href={brand.url} className="text-xs text-[var(--pg-muted)] underline-offset-4 hover:underline">
          Página criada com {brand.name}
        </a>
      </footer>
    </PublicShell>
  );
}
