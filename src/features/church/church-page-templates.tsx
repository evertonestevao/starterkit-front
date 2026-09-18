import type { CSSProperties, ReactNode } from "react";
import { Outfit } from "next/font/google";
import {
  ArrowRight,
  CalendarCheck,
  Clock3,
  HandCoins,
  Heart,
  MapPin,
  Navigation,
  Share2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { brand } from "@/config/brand";
import {
  EventSignupForm,
  PrayerForm,
  VisitorForm,
} from "@/features/church/components/public-actions";
import { CopyPix } from "@/features/church/components/copy-pix";
import { SocialIcon } from "@/features/church/components/social-icon";
import {
  churchInitials,
  directionsUrl,
  normalizeSocialLinks,
  orderServiceTimes,
} from "@/lib/churchPublicPage";
import { sponsorshipPath } from "@/lib/sponsorPaths";
// PublicChurch, e não Church: esta página renderiza só o que o `anon` pode
// ler (as colunas de domínio próprio ficam de fora).
import type { PublicChurch as ChurchRecord } from "@/types/database";
import type { PublicSponsor as Sponsor } from "@/types/sponsorship";

/**
 * Página pública da igreja — o que o QR Code, o link no WhatsApp e o domínio
 * próprio abrem. Quase sempre no celular, quase sempre com pressa.
 *
 * Formato: cabeçalho curto, uma grade de atalhos logo em cima (cada bloco
 * leva à sua seção) e as seções abertas embaixo, em faixas alternadas. Uma
 * coluna só, estreita também no desktop — é conteúdo de celular.
 *
 * Só entra atalho do que existe DE VERDADE nesta igreja. Campo vazio não
 * aparece: a versão anterior preenchia o vazio com endereço de outra cidade,
 * links sociais para "#" e botões de "Dízimos" e "Quero ser membro" que não
 * levavam a lugar nenhum — o visitante não tem como saber que é enfeite.
 */

const titulos = Outfit({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });

export type ChurchPageTemplateProps = {
  church: ChurchRecord;
  sponsors: Sponsor[];
  templateSlug: "classico" | "clean" | "dark";
};

/**
 * As três aparências que a igreja pode escolher, como variáveis CSS. A página
 * é uma só; muda a paleta. Contraste de texto conferido em cada uma (AA).
 */
const PALETAS: Record<ChurchPageTemplateProps["templateSlug"], Record<string, string>> = {
  dark: {
    "--pg-bg": "#1a1a1a",
    "--pg-band": "#1f1f1f",
    "--pg-hero": "#161616",
    "--pg-hero-text": "#f4f4f4",
    "--pg-hero-muted": "#a9a9a9",
    "--pg-hero-accent": "#5ccf9b",
    "--pg-surface": "#242424",
    "--pg-surface-2": "#2b2b2b",
    "--pg-text": "#f1f1f1",
    "--pg-muted": "#a8a8a8",
    "--pg-border": "rgba(255, 255, 255, 0.08)",
    "--pg-accent": "#5ccf9b",
    "--pg-accent-fg": "#0b1a13",
    "--pg-accent-soft": "rgba(92, 207, 155, 0.13)",
    "--pg-danger": "#f2a097",
  },
  classico: {
    "--pg-bg": "#f6f1e8",
    "--pg-band": "#efe8db",
    "--pg-hero": "#1c2b3a",
    "--pg-hero-text": "#f6efe2",
    "--pg-hero-muted": "#cbc4b4",
    // Vinho sobre o marinho dava 1,6:1 — ilegível. No cabeçalho, dourado.
    "--pg-hero-accent": "#d9be7e",
    "--pg-surface": "#ffffff",
    "--pg-surface-2": "#fbf8f2",
    "--pg-text": "#1c2b3a",
    "--pg-muted": "#5b6470",
    "--pg-border": "rgba(28, 43, 58, 0.12)",
    "--pg-accent": "#7a2e3a",
    "--pg-accent-fg": "#fff8f0",
    "--pg-accent-soft": "rgba(122, 46, 58, 0.09)",
    "--pg-danger": "#a3322a",
  },
  clean: {
    "--pg-bg": "#f7f8f5",
    "--pg-band": "#eef2ec",
    "--pg-hero": "#e3ece4",
    "--pg-hero-text": "#1d2a21",
    "--pg-hero-muted": "#4d5c52",
    "--pg-hero-accent": "#36684a",
    "--pg-surface": "#ffffff",
    "--pg-surface-2": "#f8faf7",
    "--pg-text": "#1d2a21",
    "--pg-muted": "#58665c",
    "--pg-border": "rgba(29, 42, 33, 0.1)",
    "--pg-accent": "#36684a",
    "--pg-accent-fg": "#ffffff",
    "--pg-accent-soft": "rgba(54, 104, 74, 0.1)",
    "--pg-danger": "#a3322a",
  },
};

interface Atalho {
  rotulo: string;
  icone: LucideIcon | "whatsapp";
  href: string;
  externo?: boolean;
}

/** Título em duas cores, como na referência: "Pedido de *oração*". */
function TituloSecao({
  icone: Icone,
  antes,
  destaque,
  subtitulo,
}: {
  icone: LucideIcon;
  antes: string;
  destaque: string;
  subtitulo?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className={`${titulos.className} flex items-center gap-2.5 text-2xl font-bold`}>
        <Icone className="size-6 shrink-0 text-[var(--pg-accent)]" aria-hidden />
        <span>
          {antes} <span className="text-[var(--pg-accent)]">{destaque}</span>
        </span>
      </h2>
      {subtitulo ? (
        <p className="mt-2 text-base leading-7 text-[var(--pg-muted)]">{subtitulo}</p>
      ) : null}
    </div>
  );
}

/** Faixa de seção de ponta a ponta, conteúdo na coluna estreita. */
function Faixa({ id, alternada, children }: { id: string; alternada: boolean; children: ReactNode }) {
  return (
    <section
      id={id}
      className={`scroll-mt-4 ${alternada ? "bg-[var(--pg-band)]" : "bg-[var(--pg-bg)]"}`}
    >
      <div className="mx-auto w-full max-w-xl px-5 py-12">{children}</div>
    </section>
  );
}

const cartao = "rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-5";

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ChurchPageRenderer({ church, sponsors, templateSlug }: ChurchPageTemplateProps) {
  const horarios = orderServiceTimes(church.service_times);
  const redes = normalizeSocialLinks(church.social_links);
  const whatsapp = redes.find((r) => r.kind === "whatsapp");
  const comoChegar = directionsUrl(church.name, church.address);
  const temCultos = horarios.length > 0 || Boolean(church.address);

  const temPix = Boolean(church.pix_chave);

  // Ordem definida pelo dono do produto: Dízimos em destaque no topo; depois
  // oração + visitante; depois eventos + cultos. WhatsApp e redes só entram,
  // no fim, quando a igreja os tem.
  const destaque: Atalho | null = temPix
    ? { rotulo: "Dízimos e ofertas", icone: HandCoins, href: "#dizimos" }
    : null;
  const pares: Atalho[] = [
    { rotulo: "Pedido de oração", icone: Heart, href: "#oracao" },
    { rotulo: "Sou visitante", icone: UserPlus, href: "#visita" },
    { rotulo: "Eventos", icone: CalendarCheck, href: "#inscricoes" },
    ...(temCultos ? [{ rotulo: "Cultos", icone: Clock3, href: "#cultos" }] : []),
    ...(whatsapp
      ? [{ rotulo: "WhatsApp", icone: "whatsapp" as const, href: whatsapp.href, externo: true }]
      : []),
    ...(redes.length > 0 ? [{ rotulo: "Redes sociais", icone: Share2, href: "#redes" }] : []),
  ];
  const atalhos: Atalho[] = destaque ? [destaque, ...pares] : pares;
  // Dízimos ocupa a linha inteira; se sobrar um sozinho no fim, ele também.
  const ultimoSozinho = pares.length % 2 === 1;

  // Ordem das seções abaixo; a faixa alterna de cor a cada uma.
  const secoes: Array<{ id: string; conteudo: ReactNode }> = [];

  if (temPix && church.pix_chave) {
    secoes.push({
      id: "dizimos",
      conteudo: (
        <>
          <TituloSecao
            icone={HandCoins}
            antes="Dízimos e"
            destaque="ofertas"
            subtitulo="Sua contribuição sustenta a obra desta igreja. A doação vai direto para a conta dela."
          />
          <div className={cartao}>
            <p className="mb-2 text-sm font-medium">Chave PIX</p>
            <CopyPix chave={church.pix_chave} />
            {church.pix_titular ? (
              <p className="mt-4 text-sm leading-6 text-[var(--pg-muted)]">
                Antes de confirmar, veja se o app do seu banco mostra{" "}
                <strong className="font-semibold text-[var(--pg-text)]">{church.pix_titular}</strong>{" "}
                como quem vai receber.
              </p>
            ) : null}
          </div>
        </>
      ),
    });
  }

  secoes.push(
    {
      id: "oracao",
      conteudo: (
        <>
          <TituloSecao
            icone={Heart}
            antes="Pedido de"
            destaque="oração"
            subtitulo="Compartilhe seu pedido e a nossa equipe vai orar por você. Pode ser anônimo."
          />
          <div className={cartao}>
            <PrayerForm churchId={church.id} />
          </div>
        </>
      ),
    },
    {
      id: "visita",
      conteudo: (
        <>
          <TituloSecao
            icone={UserPlus}
            antes="Sou"
            destaque="visitante"
            subtitulo="Que alegria ter você aqui! Deixe seu contato e a gente te recebe."
          />
          <div className={cartao}>
            <VisitorForm churchId={church.id} />
          </div>
        </>
      ),
    },
    {
      id: "inscricoes",
      conteudo: (
        <>
          <TituloSecao
            icone={CalendarCheck}
            antes="Inscrições em"
            destaque="eventos"
            subtitulo="Retiros, cultos especiais e encontros. Diga qual e a gente guarda o seu lugar."
          />
          <div className={cartao}>
            <EventSignupForm churchId={church.id} />
          </div>
        </>
      ),
    },
  );

  if (temCultos) {
    secoes.push({
      id: "cultos",
      conteudo: (
        <>
          <TituloSecao icone={Clock3} antes="Nossos" destaque="cultos" subtitulo="Venha estar com a gente." />
          <div className={cartao}>
            {horarios.length > 0 ? (
              <ul className="divide-y divide-[var(--pg-border)]">
                {horarios.map((h) => (
                  <li key={h.dia} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="font-semibold">{h.dia}</span>
                    <span className="text-right text-[var(--pg-muted)] tabular-nums">{h.horario}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {church.address ? (
              <div className={horarios.length > 0 ? "mt-5 border-t border-[var(--pg-border)] pt-5" : ""}>
                <p className="flex items-start gap-2 leading-6">
                  <MapPin className="mt-1 size-4 shrink-0 text-[var(--pg-accent)]" aria-hidden />
                  <span>{church.address}</span>
                </p>
                {comoChegar ? (
                  <a
                    href={comoChegar}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pg-accent)] font-semibold text-[var(--pg-accent-fg)]"
                  >
                    <Navigation className="size-4" aria-hidden />
                    Como chegar
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      ),
    });
  }

  if (redes.length > 0) {
    secoes.push({
      id: "redes",
      conteudo: (
        <>
          <TituloSecao icone={Share2} antes="Redes" destaque="sociais" subtitulo="Acompanhe a igreja durante a semana." />
          <div className="grid grid-cols-2 gap-3">
            {redes.map((rede) => (
              <a
                key={rede.kind}
                href={rede.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-16 items-center justify-center gap-2.5 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] font-semibold"
              >
                <SocialIcon kind={rede.kind} className="size-5" />
                {rede.rotulo}
              </a>
            ))}
          </div>
        </>
      ),
    });
  }

  return (
    <div
      style={PALETAS[templateSlug] as CSSProperties}
      className="min-h-svh bg-[var(--pg-bg)] text-[var(--pg-text)]"
    >
      <header className="bg-[var(--pg-hero)]">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center px-5 pt-14 pb-10 text-center">
          {church.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo em storage externo
            <img src={church.logo_url} alt="" className="h-20 w-auto max-w-[70%] object-contain" />
          ) : (
            <span
              aria-hidden
              className={`${titulos.className} flex size-20 items-center justify-center rounded-full border-2 border-[var(--pg-hero-muted)]/40 text-3xl font-semibold text-[var(--pg-hero-text)]`}
            >
              {churchInitials(church.name)}
            </span>
          )}
          <h1
            className={`${titulos.className} mt-5 text-3xl leading-tight font-bold text-balance text-[var(--pg-hero-text)]`}
          >
            {church.name}
          </h1>
          {church.address ? (
            <p className="mt-2 text-base text-[var(--pg-hero-muted)]">{church.address}</p>
          ) : null}
        </div>
      </header>

      <nav aria-label="Atalhos" className="bg-[var(--pg-hero)] pb-12">
        <div className="mx-auto w-full max-w-xl px-5">
          <p className={`${titulos.className} mb-5 text-center text-2xl font-bold text-[var(--pg-hero-accent)]`}>
            Bem-vindo(a)!
          </p>
          <ul className="grid grid-cols-2 gap-3">
            {atalhos.map((a, i) => {
              const largo = (destaque !== null && i === 0) || (ultimoSozinho && i === atalhos.length - 1);
              return (
                <li key={a.rotulo} className={largo ? "col-span-2" : undefined}>
                  <a
                    href={a.href}
                    {...(a.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="flex h-full min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] px-3 py-4 text-center font-semibold text-[var(--pg-text)] transition-colors hover:border-[var(--pg-accent)]"
                  >
                    {a.icone === "whatsapp" ? (
                      <SocialIcon kind="whatsapp" className="size-6 text-[var(--pg-accent)]" />
                    ) : (
                      <a.icone className="size-6 text-[var(--pg-accent)]" aria-hidden />
                    )}
                    {a.rotulo}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Quem sustenta a página, logo abaixo dos atalhos. Sem caixa em volta:
          é uma faixa leve de "quem apoia", não mais um card — dentro de uma
          faixa que já é um bloco, a borda virava card dentro de card. */}
      <section id="apoio" className="border-t border-[var(--pg-border)] bg-[var(--pg-bg)]">
        <div className="mx-auto w-full max-w-xl px-5 py-10 text-center">
          <h2 className="text-xs font-semibold tracking-[0.14em] text-[var(--pg-muted)] uppercase">
            Quem apoia esta página
          </h2>
          {sponsors.length > 0 ? (
            <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-left sm:flex sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-4">
              {sponsors.map((sponsor) => (
                <li key={sponsor.id} className="flex items-center gap-2.5">
                  {sponsor.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo em storage externo
                    <img src={sponsor.logo_url} alt="" className="size-9 shrink-0 rounded-lg bg-white object-contain" />
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--pg-accent-soft)] text-xs font-semibold text-[var(--pg-accent)]"
                    >
                      {iniciais(sponsor.name)}
                    </span>
                  )}
                  <span className="min-w-0 text-sm leading-5 font-medium">{sponsor.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mx-auto mt-5 max-w-sm text-sm leading-6 text-[var(--pg-muted)]">
            Negócios e pessoas da comunidade mantêm esta página no ar, sem custo para a igreja.{" "}
            <a
              href={sponsorshipPath(church.public_code)}
              className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-[var(--pg-accent)]"
            >
              Quero apoiar
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
          </p>
        </div>
      </section>

      {secoes.map((s, i) => (
        <Faixa key={s.id} id={s.id} alternada={i % 2 === 0}>
          {s.conteudo}
        </Faixa>
      ))}

      <footer className="bg-[var(--pg-bg)] px-4 pt-2 pb-10 text-center">
        <a href={brand.url} className="text-xs text-[var(--pg-muted)] underline-offset-4 hover:underline">
          Página criada com {brand.name}
        </a>
      </footer>
    </div>
  );
}

export const templatePreviewOptions = [
  { slug: "classico", label: "Clássico", hint: "Navy + vinho" },
  { slug: "clean", label: "Clean", hint: "Claro + sálvia" },
  { slug: "dark", label: "Dark", hint: "Grafite + verde" },
] as const;
