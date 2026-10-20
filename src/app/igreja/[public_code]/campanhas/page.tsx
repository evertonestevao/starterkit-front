import { caminhoDaIgreja } from "@/lib/churchPaths";
import { formatChurchName } from "@/lib/churchName";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, HandCoins } from "lucide-react";
import { brand } from "@/config/brand";
import { fonteTitulos, PublicShell } from "@/features/church/components/public-shell";
import { getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";
import { formatCents } from "@/services/sponsorPricing";
import type { Campaign } from "@/types/database";

type Params = { params: Promise<{ public_code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const carregado = await loadPublicChurch((await params).public_code);
  if (!carregado) return { title: "Campanhas" };
  return {
    title: `Campanhas · ${formatChurchName(carregado.church.name, carregado.church.sobrenome)}`,
    description: `Projetos que a ${formatChurchName(carregado.church.name, carregado.church.sobrenome)} está arrecadando para realizar.`,
  };
}

function CampaignCard({ campanha, href }: { campanha: Campaign; href: string }) {
  const percentual =
    campanha.meta_cents > 0
      ? Math.min(100, Math.round((campanha.total_arrecadado_liquido_cents / campanha.meta_cents) * 100))
      : 0;

  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-4 transition-colors hover:border-[var(--pg-accent)]"
    >
      {campanha.foto_capa_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={campanha.foto_capa_url}
          alt={`Capa de ${campanha.titulo}`}
          className="aspect-[2/1] w-full rounded-xl object-cover"
        />
      ) : null}
      <div>
        <p className="font-semibold text-[var(--pg-text)]">{campanha.titulo}</p>
        {campanha.status === "encerrada" ? (
          <p className="mt-1 text-xs font-medium text-[var(--pg-muted)]">Encerrada</p>
        ) : null}
      </div>
      {campanha.mostrar_progresso ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--pg-band)]">
            <div className="h-full rounded-full bg-[var(--pg-accent)]" style={{ width: `${percentual}%` }} />
          </div>
          <p className="text-xs text-[var(--pg-muted)]">
            {formatCents(campanha.total_arrecadado_liquido_cents)} de {formatCents(campanha.meta_cents)} · {percentual}%
          </p>
        </div>
      ) : null}
    </Link>
  );
}

export default async function ChurchCampaignsPage({ params }: Params) {
  const { public_code } = await params;
  const carregado = await loadPublicChurch(public_code);
  if (!carregado) notFound();
  const { church, theme, accent } = carregado;

  const campanhas = await (await getPublicChurchRepository()).listActiveCampaigns(church.id);
  const emAndamento = campanhas.filter((campanha) => campanha.status !== "encerrada");
  const encerradas = campanhas.filter((campanha) => campanha.status === "encerrada");
  const base = caminhoDaIgreja(church.public_code);

  return (
    <PublicShell theme={theme} accent={accent}>
      <header className="bg-[var(--pg-hero)]">
        <div className="mx-auto w-full max-w-xl px-5 pt-6 pb-10">
          <Link
            href={base}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--pg-hero-muted)] hover:text-[var(--pg-hero-text)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {formatChurchName(church.name, church.sobrenome)}
          </Link>
          <h1
            className={`${fonteTitulos.className} mt-8 flex items-center gap-2.5 text-3xl font-bold text-[var(--pg-hero-text)]`}
          >
            <HandCoins className="size-7 shrink-0 text-[var(--pg-hero-accent)]" aria-hidden />
            <span>
              Nossas <span className="text-[var(--pg-hero-accent)]">campanhas</span>
            </span>
          </h1>
          <p className="mt-2 text-base text-[var(--pg-hero-muted)]">
            Escolha um projeto para ver a história completa e apoiar.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-5 py-8">
        {emAndamento.length > 0 ? (
          <div className="flex flex-col gap-3">
            {emAndamento.map((campanha) => (
              <CampaignCard key={campanha.id} campanha={campanha} href={`${base}/campanhas/${campanha.id}`} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-6 text-center">
            <p className="font-medium">Nenhuma campanha no momento.</p>
            <p className="mt-1 text-sm text-[var(--pg-muted)]">Volte em breve para ver os próximos projetos.</p>
            <Link href={base} className="mt-4 inline-block text-sm font-semibold text-[var(--pg-accent)]">
              Voltar para a página da igreja
            </Link>
          </div>
        )}

        {encerradas.length > 0 ? (
          // <details> nativo: recolhe sem JavaScript, e as encerradas ficam no
          // fim da página, fora do caminho de quem veio para apoiar.
          <details className="group mt-8">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-1.5 text-sm font-semibold text-[var(--pg-muted)] hover:text-[var(--pg-text)] [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Ver campanhas encerradas ({encerradas.length})</span>
              <span className="hidden group-open:inline">Ocultar campanhas encerradas</span>
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-4 flex flex-col gap-3">
              {encerradas.map((campanha) => (
                <CampaignCard key={campanha.id} campanha={campanha} href={`${base}/campanhas/${campanha.id}`} />
              ))}
            </div>
          </details>
        ) : null}
      </main>

      <footer className="px-4 pt-2 pb-10 text-center">
        <a href={brand.url} className="text-xs text-[var(--pg-muted)] underline-offset-4 hover:underline">
          Página criada com {brand.name}
        </a>
      </footer>
    </PublicShell>
  );
}
