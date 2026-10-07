import { caminhoDaIgreja } from "@/lib/churchPaths";
import { formatChurchName } from "@/lib/churchName";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck } from "lucide-react";
import { brand } from "@/config/brand";
import { EventCard } from "@/features/church/components/event-card";
import { fonteTitulos, PublicShell } from "@/features/church/components/public-shell";
import { getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";

type Params = { params: Promise<{ public_code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const carregado = await loadPublicChurch((await params).public_code);
  if (!carregado) return { title: "Eventos" };
  return {
    title: `Eventos · ${formatChurchName(carregado.church.name, carregado.church.sobrenome)}`,
    description: `Próximos eventos da ${formatChurchName(carregado.church.name, carregado.church.sobrenome)}. Veja os detalhes e faça sua inscrição.`,
  };
}

/**
 * Eventos da igreja (com inscrição): os próximos, do mais perto ao mais longe.
 * Cada cartão abre o detalhe, onde fica a inscrição.
 */
export default async function ChurchEventsPage({ params }: Params) {
  const { public_code } = await params;
  const carregado = await loadPublicChurch(public_code);
  if (!carregado) notFound();
  const { church, theme, accent } = carregado;

  const eventos = await (await getPublicChurchRepository()).listUpcomingEvents(church.id);
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
            <CalendarCheck className="size-7 shrink-0 text-[var(--pg-hero-accent)]" aria-hidden />
            <span>
              Próximos <span className="text-[var(--pg-hero-accent)]">eventos</span>
            </span>
          </h1>
          <p className="mt-2 text-base text-[var(--pg-hero-muted)]">
            Escolha um evento para ver os detalhes e fazer sua inscrição.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-5 py-8">
        {eventos.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {eventos.map((evento) => (
              <li key={evento.id}>
                <EventCard
                  evento={evento}
                  href={`${base}/eventos/${evento.id}`}
                  enderecoDaIgreja={church.address}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-6 text-center">
            <p className="font-medium">Nenhum evento agendado no momento.</p>
            <p className="mt-1 text-sm text-[var(--pg-muted)]">Volte em breve para ver os próximos.</p>
            <Link href={base} className="mt-4 inline-block text-sm font-semibold text-[var(--pg-accent)]">
              Voltar para a página da igreja
            </Link>
          </div>
        )}
      </main>

      <footer className="px-4 pt-2 pb-10 text-center">
        <a href={brand.url} className="text-xs text-[var(--pg-muted)] underline-offset-4 hover:underline">
          Página criada com {brand.name}
        </a>
      </footer>
    </PublicShell>
  );
}
