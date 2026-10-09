import { BotaoAppDaIgreja } from "@/components/pwa/botao-app-da-igreja";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  Church,
  Clock3,
  CreditCard,
  HandCoins,
  Heart,
  MapPin,
  Navigation,
  Share2,
  ShoppingBag,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { caminhoDaIgreja } from "@/lib/churchPaths";
import { brand } from "@/config/brand";
import { EventCard } from "@/features/church/components/event-card";
import { PrayerForm, VisitorForm } from "@/features/church/components/public-actions";
import { CopyPix } from "@/features/church/components/copy-pix";
import { fonteTitulos as titulos, PublicShell } from "@/features/church/components/public-shell";
import { SocialIcon } from "@/features/church/components/social-icon";
import { formatHora, groupWeekly, specialBadge, specialWhen, upcomingSpecials } from "@/lib/churchSchedule";
import { churchInitials, directionsUrl, normalizeSocialLinks, orderServiceTimes } from "@/lib/churchPublicPage";
import { sponsorLinkHref } from "@/lib/sponsorLink";
import { sponsorshipPath } from "@/lib/sponsorPaths";
// PublicChurch, e não Church: esta página renderiza só o que o `anon` pode
// ler (as colunas de domínio próprio ficam de fora).
import type { Campaign, ChurchEvent, ChurchScheduleItem, PublicChurch as ChurchRecord } from "@/types/database";
import { features } from "@/config/features";
import type { ChurchTheme } from "@/lib/pageAppearance";
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

export type ChurchPageTemplateProps = {
  church: ChurchRecord;
  sponsors: Sponsor[];
  /** Próximos eventos (poucos): a página mostra uma prévia e leva à lista. */
  eventos: ChurchEvent[];
  /** Campanhas ativas ou encerradas — só para saber se o atalho aparece. */
  campanhas: Campaign[];
  /** Programação publicada: cultos semanais e especiais. */
  programacao: ChurchScheduleItem[];
  /** Sede com igrejas ligadas: mostra o atalho para a tela "Nossas igrejas". */
  temRede?: boolean;
  /** Tem venda aberta (camiseta, pastel...): mostra o atalho para a tela de vendas. */
  temVendas?: boolean;
  /** Página ainda fora do ar, vista por quem administra a igreja. */
  previa?: boolean;
  /** BR Code do PIX e o QR dele, montados no servidor a partir da chave. */
  pixCopiaECola?: string | null;
  pixQrDataUrl?: string | null;
  /**
   * Link de doação por cartão, quando a igreja tem conta aprovada no provedor
   * E escolheu ligar o cartão. Null é o caso comum: PIX sozinho basta.
   */
  linkCartao?: string | null;
  /**
   * Link de doação por Pix pela subconta Asaas — só preenchido quando
   * church.pix_fonte = "asaas". Nunca aparece junto com a chave própria.
   */
  linkPix?: string | null;
  templateSlug: ChurchTheme;
  /** Cor de destaque escolhida pela igreja; null usa a do tema. */
  accent?: string | null;
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
  centralizado = false,
}: {
  icone: LucideIcon;
  antes: string;
  destaque: string;
  subtitulo?: string;
  /** Redes sociais: título, subtítulo e os links abaixo ficam todos no centro. */
  centralizado?: boolean;
}) {
  return (
    <div className={`mb-5 ${centralizado ? "text-center" : ""}`}>
      <h2
        className={`${titulos.className} flex items-center gap-2.5 text-2xl font-bold ${centralizado ? "justify-center" : ""}`}
      >
        <Icone className="size-6 shrink-0 text-[var(--pg-accent)]" aria-hidden />
        <span>
          {antes} <span className="text-[var(--pg-accent)]">{destaque}</span>
        </span>
      </h2>
      {subtitulo ? <p className="mt-2 text-base leading-7 text-[var(--pg-muted)]">{subtitulo}</p> : null}
    </div>
  );
}

/** Faixa de seção de ponta a ponta, conteúdo na coluna estreita. */
function Faixa({ id, alternada, children }: { id: string; alternada: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-4 ${alternada ? "bg-[var(--pg-band)]" : "bg-[var(--pg-bg)]"}`}>
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

/**
 * Logo + nome de um patrocinador. Com link aprovado pela moderação, o conjunto
 * vira um link externo: `noopener` para a aba nova não controlar esta página,
 * `sponsored`/`nofollow` porque é destino pago, escolhido por terceiro.
 */
function SponsorBadge({ sponsor }: { sponsor: Sponsor }) {
  const href = sponsorLinkHref({ tipo: sponsor.link_tipo, valor: sponsor.link_valor }, { comMensagem: true });
  const conteudo = (
    <>
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
    </>
  );

  if (!href) {
    return <div className="flex items-center gap-2.5">{conteudo}</div>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow sponsored"
      aria-label={`${sponsor.name} (abre em uma nova aba)`}
      className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--pg-accent)]"
    >
      {conteudo}
    </a>
  );
}

export function ChurchPageRenderer({
  church,
  sponsors,
  eventos,
  campanhas,
  programacao,
  temRede = false,
  temVendas = false,
  previa = false,
  pixCopiaECola = null,
  pixQrDataUrl = null,
  linkCartao = null,
  linkPix = null,
  templateSlug,
  accent = null,
}: ChurchPageTemplateProps) {
  const horarios = orderServiceTimes(church.service_times);
  const redes = normalizeSocialLinks(church.social_links);
  const whatsapp = redes.find((r) => r.kind === "whatsapp");
  const comoChegar = directionsUrl(church.name, church.address);
  const semana = groupWeekly(programacao);
  // Especiais dos próximos meses; mais que isso vira ruído na página.
  const especiais = upcomingSpecials(programacao).slice(0, 4);
  // Igreja que ainda não usa a Programação cai no campo antigo (texto livre).
  const usaLegado = semana.length === 0 && especiais.length === 0;
  const temCultos = semana.length > 0 || especiais.length > 0 || horarios.length > 0 || Boolean(church.address);

  // Só um Pix por vez: chave própria OU o da subconta Asaas, nunca os dois —
  // duas opções de Pix juntas confundiriam quem doa.
  const temPixPropria = church.pix_fonte === "propria" && Boolean(church.pix_chave);
  const temPixAsaas = church.pix_fonte === "asaas" && Boolean(linkPix);
  // A seção de doação existe com Pix (de um jeito ou de outro), com cartão, ou com os dois.
  const temDoacao = temPixPropria || temPixAsaas || Boolean(linkCartao);

  // Ordem definida pelo dono do produto: Dízimos em destaque no topo; depois
  // oração + visitante; depois eventos + cultos. WhatsApp e redes só entram,
  // no fim, quando a igreja os tem.
  const destaque: Atalho | null = temDoacao
    ? { rotulo: "Dízimos e ofertas", icone: HandCoins, href: "#dizimos" }
    : null;
  const pares: Atalho[] = [
    { rotulo: "Pedido de oração", icone: Heart, href: "#oracao" },
    { rotulo: "Quero uma visita", icone: UserPlus, href: "#visita" },
    // Eventos abre a tela de eventos — e só aparece com evento agendado.
    ...(eventos.length > 0
      ? [{ rotulo: "Eventos", icone: CalendarCheck, href: `${caminhoDaIgreja(church.public_code)}/eventos` }]
      : []),
    // Campanhas só aparece com pelo menos uma (ativa ou encerrada) publicada.
    ...(campanhas.length > 0
      ? [{ rotulo: "Campanhas", icone: HandCoins, href: `${caminhoDaIgreja(church.public_code)}/campanhas` }]
      : []),
    ...(temVendas
      ? [{ rotulo: "Vendas", icone: ShoppingBag, href: `${caminhoDaIgreja(church.public_code)}/vendas` }]
      : []),
    ...(temCultos ? [{ rotulo: "Programação", icone: Clock3, href: "#programacao" }] : []),
    // Abre a lista numa tela própria: um ministério pode ter centenas de igrejas.
    ...(temRede
      ? [{ rotulo: "Nossas igrejas", icone: Church, href: `${caminhoDaIgreja(church.public_code)}/igrejas` }]
      : []),
    ...(whatsapp ? [{ rotulo: "WhatsApp", icone: "whatsapp" as const, href: whatsapp.href, externo: true }] : []),
    ...(redes.length > 0 ? [{ rotulo: "Redes sociais", icone: Share2, href: "#redes" }] : []),
  ];
  const atalhos: Atalho[] = destaque ? [destaque, ...pares] : pares;
  // Dízimos ocupa a linha inteira; se sobrar um sozinho no fim, ele também.
  const ultimoSozinho = pares.length % 2 === 1;

  // Ordem das seções abaixo; a faixa alterna de cor a cada uma.
  const secoes: Array<{ id: string; conteudo: ReactNode }> = [];

  if (temDoacao) {
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
            {temPixPropria ? (
              <>
                <p className="mb-2 text-sm font-medium">Chave PIX</p>
                <CopyPix
                  chave={church.pix_chave as string}
                  churchId={church.id}
                  copiaECola={pixCopiaECola}
                  qrDataUrl={pixQrDataUrl}
                />
              </>
            ) : null}
            {temPixPropria && church.pix_titular ? (
              <p className="mt-4 text-sm leading-6 text-[var(--pg-muted)]">
                Antes de confirmar, veja se o app do seu banco mostra{" "}
                <strong className="font-semibold text-[var(--pg-text)]">{church.pix_titular}</strong> como quem vai
                receber.
              </p>
            ) : null}
            {/* Pix pela Asaas: link próprio, nunca junto com o de cartão. */}
            {temPixAsaas ? (
              <div className={temPixPropria ? "mt-4" : ""}>
                <a
                  href={linkPix as string}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--pg-border)] font-semibold"
                >
                  <HandCoins className="size-4" aria-hidden />
                  Doar com Pix
                </a>
                <p className="mt-2 text-xs leading-5 text-[var(--pg-muted)]">
                  Abre a página segura do Asaas. O provedor cobra uma tarifa sobre o valor (não é taxa da igreja),
                  descontada antes de cair na conta dela.
                </p>
              </div>
            ) : null}
            {/* Cartão: leva para a página do provedor, onde a doação é paga.
                O dinheiro cai na conta da própria igreja. */}
            {linkCartao ? (
              <div className={temPixPropria || temPixAsaas ? "mt-4" : ""}>
                <a
                  href={linkCartao}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[var(--pg-border)] font-semibold"
                >
                  <CreditCard className="size-4" aria-hidden />
                  Doar com cartão
                </a>
                <p className="mt-2 text-xs leading-5 text-[var(--pg-muted)]">
                  Abre a página segura do Asaas. O provedor cobra uma tarifa sobre o valor (não é taxa da igreja),
                  descontada antes de cair na conta dela.
                </p>
              </div>
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
            antes="Quer receber uma"
            destaque="visita?"
            subtitulo="Se você deseja a visita do Pastor ou de alguém da igreja, para uma oração ou uma conversa, deixe seu telefone. A gente liga para combinar o melhor dia."
          />
          <div className={cartao}>
            <VisitorForm churchId={church.id} />
          </div>
        </>
      ),
    },
  );

  if (church.sobre) {
    secoes.push({
      id: "sobre",
      conteudo: (
        <>
          <TituloSecao icone={Church} antes="Sobre a" destaque="igreja" />
          {/* Texto simples, com as quebras de linha de quem escreveu. */}
          <p className={`${cartao} text-base leading-7 whitespace-pre-line text-[var(--pg-text)]`}>{church.sobre}</p>
        </>
      ),
    });
  }

  if (eventos.length > 0) {
    secoes.push({
      id: "eventos",
      conteudo: (
        <>
          <TituloSecao
            icone={CalendarCheck}
            antes="Próximos"
            destaque="eventos"
            subtitulo="Toque num evento para ver os detalhes e se inscrever."
          />
          <ul className="flex flex-col gap-3">
            {eventos.map((evento) => (
              <li key={evento.id}>
                <EventCard
                  evento={evento}
                  href={`${caminhoDaIgreja(church.public_code)}/eventos/${evento.id}`}
                  enderecoDaIgreja={church.address}
                  compacto
                />
              </li>
            ))}
          </ul>
          <a
            href={`${caminhoDaIgreja(church.public_code)}/eventos`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pg-accent)]"
          >
            Ver todos os eventos
            <ArrowRight className="size-4" aria-hidden />
          </a>
        </>
      ),
    });
  }

  if (temCultos) {
    secoes.push({
      id: "programacao",
      conteudo: (
        <>
          <TituloSecao icone={Clock3} antes="Nossa" destaque="programação" subtitulo="Venha estar com a gente." />
          <div className={cartao}>
            {semana.length > 0 ? (
              <div className="flex flex-col gap-4">
                {semana.map((d) => (
                  <div key={d.dia}>
                    <p className="text-xs font-semibold tracking-[0.12em] text-[var(--pg-muted)] uppercase">
                      {d.rotulo}
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {d.itens.map((item) => (
                        <li key={item.id} className="flex items-baseline gap-3">
                          <span className="w-12 shrink-0 font-semibold text-[var(--pg-accent)] tabular-nums">
                            {formatHora(item.hora)}
                          </span>
                          <span className="min-w-0">
                            <span className="font-medium">{item.titulo}</span>
                            {item.descricao || item.local ? (
                              <span className="block text-sm text-[var(--pg-muted)]">
                                {[item.descricao, item.local].filter(Boolean).join(" · ")}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}

            {usaLegado && horarios.length > 0 ? (
              <ul className="divide-y divide-[var(--pg-border)]">
                {horarios.map((h) => (
                  <li key={h.dia} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="font-semibold">{h.dia}</span>
                    <span className="text-right text-[var(--pg-muted)] tabular-nums">{h.horario}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {especiais.length > 0 ? (
              <div className={semana.length > 0 ? "mt-5 border-t border-[var(--pg-border)] pt-5" : ""}>
                <p className="text-xs font-semibold tracking-[0.12em] text-[var(--pg-muted)] uppercase">Especiais</p>
                <ul className="mt-2 flex flex-col gap-3">
                  {especiais.map((item) => {
                    const selo = specialBadge(item.data!);
                    return (
                      <li key={item.id} className="flex items-center gap-3">
                        <span className="flex size-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--pg-accent-soft)] text-[var(--pg-accent)]">
                          <span className={`${titulos.className} text-lg leading-none font-bold`}>{selo.dia}</span>
                          <span className="mt-0.5 text-[0.65rem] font-semibold tracking-wider">{selo.mes}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium">{item.titulo}</span>
                          <span className="block text-sm text-[var(--pg-muted)]">
                            {specialWhen(item.data!, item.hora)}
                            {item.local ? ` · ${item.local}` : ""}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {church.address ? (
              <div
                className={
                  semana.length > 0 || especiais.length > 0 || (usaLegado && horarios.length > 0)
                    ? "mt-5 border-t border-[var(--pg-border)] pt-5"
                    : ""
                }
              >
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
          <TituloSecao
            icone={Share2}
            antes="Redes"
            destaque="sociais"
            subtitulo="Acompanhe a igreja durante a semana."
            centralizado
          />
          {/* flex + justify-center (não grid-cols-2 fixo): com 1 rede ela fica
              sozinha no meio, com 2 elas dividem o centro, com 3+ a última
              linha incompleta também fica centralizada. */}
          <div className="flex flex-wrap justify-center gap-3">
            {redes.map((rede) => (
              <a
                key={rede.kind}
                href={rede.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-16 basis-[calc(50%-0.375rem)] items-center justify-center gap-2.5 rounded-2xl border border-[var(--pg-border)] bg-[var(--pg-surface)] font-semibold"
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

  const primeira = secoes.find((x) => x.id === "programacao") ?? null;
  const demais = secoes.filter((x) => x !== primeira);

  return (
    <PublicShell theme={templateSlug} accent={accent}>
      {previa ? (
        <p role="status" className="bg-amber-400 px-4 py-2.5 text-center text-sm font-medium text-amber-950">
          Prévia: esta página ainda não está no ar. Só quem administra a igreja vê. Publique em Painel → Primeiros
          passos.
        </p>
      ) : null}
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
          {church.sobrenome ? (
            <p
              className={`${titulos.className} mt-1.5 text-xl leading-snug font-semibold text-balance text-[var(--pg-hero-muted)]`}
            >
              {church.sobrenome}
            </p>
          ) : null}
          {church.address ? <p className="mt-2 text-base text-[var(--pg-hero-muted)]">{church.address}</p> : null}
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

      {/* Programação primeiro, logo abaixo dos atalhos: é o que mais se procura. */}
      {primeira ? (
        <Faixa id={primeira.id} alternada>
          {primeira.conteudo}
        </Faixa>
      ) : null}

      {/* Quem sustenta a página, logo abaixo da programação. Sem caixa em volta:
          é uma faixa leve de "quem apoia", não mais um card — dentro de uma
          faixa que já é um bloco, a borda virava card dentro de card.
          A igreja pode fechar a porta pra patrocinador (Configurações):
          sem `aceita_patrocinio`, o espaço nem existe aqui — não é uma
          lista vazia, a seção some por inteiro. */}
      {church.aceita_patrocinio && features.patrocinioVisivel ? (
        <section id="apoio" className="border-t border-[var(--pg-border)] bg-[var(--pg-bg)]">
          <div className="mx-auto w-full max-w-xl px-5 py-10 text-center">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-[var(--pg-muted)] uppercase">
              Quem apoia esta página
            </h2>
            {sponsors.length > 0 ? (
              <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-left sm:flex sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-4">
                {sponsors.map((sponsor) => (
                  <li key={sponsor.id}>
                    <SponsorBadge sponsor={sponsor} />
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
      ) : null}

      {demais.map((s, i) => (
        <Faixa key={s.id} id={s.id} alternada={(i + (primeira ? 1 : 0)) % 2 === 0}>
          {s.conteudo}
        </Faixa>
      ))}

      <footer className="bg-[var(--pg-bg)] px-4 pt-2 pb-10 text-center">
        {previa ? null : <BotaoAppDaIgreja nomeDaIgreja={church.name} />}
        <br />
        <a href={brand.url} className="text-xs text-[var(--pg-muted)] underline-offset-4 hover:underline">
          Página criada com {brand.name}
        </a>
      </footer>
    </PublicShell>
  );
}
