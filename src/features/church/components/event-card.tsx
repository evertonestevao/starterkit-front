import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { fonteTitulos } from "@/features/church/components/public-shell";
import { eventDateBadge, eventPrice, eventSummary, eventWhen } from "@/lib/churchEvents";
import type { ChurchEvent } from "@/types/database";

/**
 * Cartão de evento da página pública. O cartão inteiro é o link — no celular,
 * acertar um "ver mais" pequeno é o que faz a pessoa desistir.
 *
 * `compacto` é a versão da página inicial: sem descrição, só o essencial para
 * a pessoa decidir se abre.
 */
export function EventCard({
  evento,
  href,
  enderecoDaIgreja,
  compacto = false,
}: {
  evento: ChurchEvent;
  href: string;
  enderecoDaIgreja: string | null;
  compacto?: boolean;
}) {
  const selo = eventDateBadge(evento.inicio);
  const resumo = compacto ? null : eventSummary(evento.descricao);
  const local = evento.local ?? enderecoDaIgreja;
  const gratuito = evento.preco_cents === 0;

  return (
    <Link
      href={href}
      className="group flex gap-4 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-4 transition-colors hover:border-[var(--pg-accent)]"
    >
      <span className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]">
        <span className={`${fonteTitulos.className} text-2xl leading-none font-bold`}>{selo.dia}</span>
        <span className="mt-1 text-xs font-semibold tracking-wider">{selo.mes}</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`${fonteTitulos.className} text-lg leading-snug font-semibold`}>{evento.titulo}</span>
        <span className="mt-1 text-sm text-[var(--pg-muted)]">{eventWhen(evento.inicio, evento.fim)}</span>
        {!compacto && local ? (
          <span className="mt-1 flex items-start gap-1.5 text-sm text-[var(--pg-muted)]">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {local}
          </span>
        ) : null}
        {/* Duas linhas: a lista serve para escolher; o texto inteiro está no detalhe. */}
        {resumo ? <span className="mt-2 line-clamp-2 text-sm leading-6">{resumo}</span> : null}

        <span className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              gratuito
                ? "bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]"
                : "border border-[var(--pg-border)] text-[var(--pg-text)]"
            }`}
          >
            {eventPrice(evento.preco_cents)}
          </span>
          {!evento.inscricoes_abertas ? (
            <span className="rounded-full border border-[var(--pg-border)] px-2.5 py-0.5 text-xs text-[var(--pg-muted)]">
              Inscrições encerradas
            </span>
          ) : null}
        </span>
      </span>

      <ChevronRight
        className="size-5 shrink-0 self-center text-[var(--pg-muted)] transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
