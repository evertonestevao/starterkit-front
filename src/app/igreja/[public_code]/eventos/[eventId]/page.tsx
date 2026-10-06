import { caminhoDaIgreja } from "@/lib/churchPaths";
import { formatChurchName } from "@/lib/churchName";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CircleDollarSign, MapPin } from "lucide-react";
import { z } from "zod";
import { brand } from "@/config/brand";
import { CopyPix } from "@/features/church/components/copy-pix";
import { EventSignupForm } from "@/features/church/components/public-actions";
import { fonteTitulos, PublicShell } from "@/features/church/components/public-shell";
import { eventDateBadge, eventPrice, eventSummary, eventWhen } from "@/lib/churchEvents";
import { getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";

type Params = { params: Promise<{ public_code: string; eventId: string }> };

/** Id que não é uuid nem chega ao banco — lá viraria erro 500, não 404. */
const eventIdSchema = z.uuid();

async function carregar(publicCode: string, eventId: string) {
  if (!eventIdSchema.safeParse(eventId).success) return null;
  const igreja = await loadPublicChurch(publicCode);
  if (!igreja) return null;
  // Busca o evento DENTRO da igreja do link: id de evento de outra igreja
  // colado aqui não abre nada.
  const evento = await (await getPublicChurchRepository()).findEvent(igreja.church.id, eventId);
  if (!evento) return null;
  // Decidido no carregamento, não no desenho: o banco também recusa
  // inscrição em evento que já começou (sign_up_for_event).
  const jaComecou = new Date(evento.inicio).getTime() <= Date.now();
  return { ...igreja, evento, jaComecou };
}

/** Título e resumo para a prévia do link no WhatsApp. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { public_code, eventId } = await params;
  const dados = await carregar(public_code, eventId);
  if (!dados) return { title: "Evento" };
  return {
    title: `${dados.evento.titulo} · ${formatChurchName(dados.church.name, dados.church.sobrenome)}`,
    description:
      eventSummary(dados.evento.descricao, 160) ??
      `${eventWhen(dados.evento.inicio, dados.evento.fim)} — ${formatChurchName(dados.church.name, dados.church.sobrenome)}`,
  };
}

export default async function ChurchEventPage({ params }: Params) {
  const { public_code, eventId } = await params;
  const dados = await carregar(public_code, eventId);
  if (!dados) notFound();
  const { church, theme, accent, evento, jaComecou } = dados;

  const base = caminhoDaIgreja(church.public_code);
  const selo = eventDateBadge(evento.inicio);
  const local = evento.local ?? church.address;
  const pago = evento.preco_cents > 0;
  const aceitaInscricao = evento.inscricoes_abertas && !jaComecou;

  // Evento pago: a plataforma não cobra. A confirmação diz como pagar direto
  // à igreja — pela chave PIX dela, quando existe.
  const pagamento = pago ? (
    <div className="flex w-full flex-col gap-3 border-t border-[var(--pg-border)] pt-3">
      {church.pix_chave ? (
        <>
          <p className="text-sm leading-6">
            Para garantir sua vaga, faça um PIX de{" "}
            <strong className="font-semibold">{eventPrice(evento.preco_cents)}</strong> para a igreja:
          </p>
          <CopyPix chave={church.pix_chave} churchId={church.id} />
          {church.pix_titular ? (
            <p className="text-sm leading-6 text-[var(--pg-muted)]">
              Confira se o app do banco mostra{" "}
              <strong className="font-semibold text-[var(--pg-text)]">{church.pix_titular}</strong>.
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm leading-6">
          A igreja vai falar com você para combinar o pagamento de{" "}
          <strong className="font-semibold">{eventPrice(evento.preco_cents)}</strong>.
        </p>
      )}
    </div>
  ) : null;

  return (
    <PublicShell theme={theme} accent={accent}>
      <header className="bg-[var(--pg-hero)]">
        <div className="mx-auto w-full max-w-xl px-5 pt-6 pb-10">
          <Link
            href={`${base}/eventos`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--pg-hero-muted)] hover:text-[var(--pg-hero-text)]"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Todos os eventos
          </Link>

          <div className="mt-8 flex items-start gap-4">
            <span className="flex size-16 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--pg-hero-accent)] text-[var(--pg-hero)]">
              <span className={`${fonteTitulos.className} text-2xl leading-none font-bold`}>{selo.dia}</span>
              <span className="mt-1 text-xs font-semibold tracking-wider">{selo.mes}</span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--pg-hero-muted)]">{formatChurchName(church.name, church.sobrenome)}</p>
              <h1
                className={`${fonteTitulos.className} mt-1 text-3xl leading-tight font-bold text-balance text-[var(--pg-hero-text)]`}
              >
                {evento.titulo}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 py-8">
        <ul className="flex flex-col divide-y divide-[var(--pg-border)] rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)]">
          <li className="flex items-start gap-3 p-4">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-[var(--pg-accent)]" aria-hidden />
            <span className="leading-6">{eventWhen(evento.inicio, evento.fim)}</span>
          </li>
          {local ? (
            <li className="flex items-start gap-3 p-4">
              <MapPin className="mt-0.5 size-5 shrink-0 text-[var(--pg-accent)]" aria-hidden />
              <span className="leading-6">{local}</span>
            </li>
          ) : null}
          <li className="flex items-start gap-3 p-4">
            <CircleDollarSign className="mt-0.5 size-5 shrink-0 text-[var(--pg-accent)]" aria-hidden />
            <span className="leading-6">
              <span className="font-semibold">{eventPrice(evento.preco_cents)}</span>
              {pago ? (
                <span className="text-[var(--pg-muted)]"> · pago direto à igreja</span>
              ) : null}
            </span>
          </li>
        </ul>

        {evento.descricao ? (
          <section>
            <h2 className={`${fonteTitulos.className} text-xl font-bold`}>Sobre o evento</h2>
            <p className="mt-3 text-base leading-7 whitespace-pre-line text-[var(--pg-text)]">
              {evento.descricao}
            </p>
          </section>
        ) : null}

        <section id="inscricao" className="rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-5">
          <h2 className={`${fonteTitulos.className} text-xl font-bold`}>
            {aceitaInscricao ? (
              <>
                Faça sua <span className="text-[var(--pg-accent)]">inscrição</span>
              </>
            ) : (
              "Inscrições"
            )}
          </h2>
          {aceitaInscricao ? (
            <div className="mt-4">
              <EventSignupForm
                eventId={evento.id}
                preco={pago ? eventPrice(evento.preco_cents) : null}
                pagamento={pagamento}
              />
            </div>
          ) : (
            <p className="mt-2 text-base leading-7 text-[var(--pg-muted)]">
              {jaComecou
                ? "Este evento já começou. Fique de olho nos próximos eventos."
                : "As inscrições para este evento estão encerradas."}
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
