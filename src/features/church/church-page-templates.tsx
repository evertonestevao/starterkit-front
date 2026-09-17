import {
  BookOpen,
  CalendarDays,
  Check,
  Church,
  Clock3,
  HandCoins,
  Heart,
  Home,
  MapPin,
  MessageSquareHeart,
  Music4,
  Play,
  Users,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  submitEventSignupAction,
  submitPrayerRequestAction,
  submitVisitorAction,
} from "@/server/actions/church";
// PublicChurch, e não Church: esta página renderiza só o que o `anon` pode
// ler (as colunas de domínio próprio não têm GRANT para ele).
import type { PublicChurch as ChurchRecord } from "@/types/database";
import type { PublicSponsor as Sponsor } from "@/types/sponsorship";
import { sponsorshipPath } from "@/lib/sponsorPaths";

export type ChurchPageTemplateProps = {
  church: ChurchRecord;
  sponsors: Sponsor[];
  templateSlug: "classico" | "clean" | "dark";
  staticPix: string;
};

function getSponsorInitials(name: string) {
  return name
    .split(" ")
    .map((segment) => segment[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getServiceTimes(church: ChurchRecord) {
  if (!church.service_times || typeof church.service_times !== "object") {
    return [] as Array<[string, string]>;
  }

  const serviceTimes = Object.entries(
    church.service_times as Record<string, string>,
  );
  return serviceTimes.length
    ? serviceTimes
    : [["Próximo culto", "Confira os horários"]];
}

function getSocialLinks(church: ChurchRecord) {
  if (!church.social_links || typeof church.social_links !== "object") {
    return [] as Array<[string, string]>;
  }

  return Object.entries(church.social_links as Record<string, string>);
}

function BaseChurchPage(
  props: ChurchPageTemplateProps & {
    accentClass: string;
    surfaceClass: string;
    tintClass: string;
    shellClass: string;
    textClass: string;
    mutedClass: string;
    buttonClass: string;
    cardClass: string;
  },
) {
  const entries = getServiceTimes(props.church);
  const socials = getSocialLinks(props.church);
  const cityLocation =
    props.church.address?.match(/,[\s\w\-]+\s*\/?\s*\w+$/)?.[0]?.replace(/^,\s*/, "") ??
    "Guaiçara · SP";

  const actionList = [
    { label: "Dízimos e ofertas", helper: "Pix ou cartão, em poucos toques", icon: HandCoins },
    { label: "Pedido de oração", helper: "Conte com a nossa intercessão", icon: Heart },
    { label: "Inscrição em eventos", helper: "Cultos especiais, retiros e conferências", icon: CalendarDays },
    { label: "Sou visitante", helper: "Deixe seu contato e receba as boas-vindas", icon: Users },
    { label: "Quero ser membro", helper: "Primeiro passo para integração", icon: MessageSquareHeart },
  ];

  const quickLinks = socials.length
    ? socials.slice(0, 4).map(([label, value]) => ({ label, value }))
    : [
        { label: "Instagram", value: "#" },
        { label: "Louvores", value: "#" },
        { label: "Bíblia", value: "#" },
        { label: "Contato", value: "#" },
      ];

  return (
    <div className={`min-h-screen ${props.shellClass}`}>
      <div className="mx-auto w-full max-w-6xl">
        <header className={`${props.surfaceClass} px-4 pb-10 pt-11 text-center sm:px-6`}>
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#D9BE7E] bg-transparent">
            <Church className="h-6 w-6 text-[#D9BE7E]" />
          </div>

          <h1
            className="text-[23px] font-semibold tracking-[0.01em] sm:text-[26px]"
            style={{ fontFamily: "Fraunces, Georgia, serif" }}
          >
            {props.church.name}
          </h1>

          <div className="mt-2 text-[13px] text-white/60">{cityLocation}</div>

          <div
            className="mx-auto mt-6 max-w-xl border-t border-white/15 pt-5 text-[14.5px] italic leading-relaxed text-white/75 sm:text-[15px]"
            style={{ fontFamily: "Fraunces, Georgia, serif" }}
          >
            “Alegrei-me quando me disseram: vamos à casa do Senhor.”
            <span className="mt-2 block text-[12px] font-normal not-italic text-[#D9BE7E]">
              Salmos 122:1
            </span>
          </div>
        </header>

        <main className="px-4 pb-8 pt-7 sm:px-6 lg:px-8">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {actionList.map((item, index) => {
              const Icon = item.icon;
              const isPrimary = index === 0;

              return (
                <a
                  key={item.label}
                  href="#"
                  className={[
                    "flex items-center gap-3 rounded-md border px-4 py-4 text-left transition-colors",
                    isPrimary ? "border-[#6E2A34] bg-[#6E2A34] text-[#F3EDE1]" : "border-[#1C2B3A]/10 bg-white text-[#241E17]",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      isPrimary ? "bg-white/10" : "bg-[#1C2B3A]/5",
                    ].join(" ")}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <strong className="block text-[15.5px] font-semibold">{item.label}</strong>
                    <span className={[
                      "block text-[12.5px] leading-snug",
                      isPrimary ? "text-[#F3EDE1]/70" : "text-[#6B6152]",
                    ].join(" ")}>
                      {item.helper}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>

          <div className="mt-6">
            <h2 className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#6B6152]">
              Mais da igreja
            </h2>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {quickLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.value}
                  className="rounded-md border border-[#1C2B3A]/10 bg-white px-2 py-3 text-center text-[12.5px] font-medium text-[#241E17]"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div className="mt-8 border-t border-[#1C2B3A]/10 pt-7">
            <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#6B6152]">
              Apoio desta página
            </h2>
            <p className="mt-1 text-[12px] text-[#6B6152]">
              Empresários da nossa comunidade que tornam este serviço gratuito para a igreja.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {props.sponsors.length ? (
                props.sponsors.slice(0, 4).map((sponsor) => (
                  <div
                    key={sponsor.id}
                    className="rounded-md border border-[#1C2B3A]/10 bg-white p-4 text-center"
                  >
                    <div className="mx-auto mb-2.5 flex h-9 w-9 items-center justify-center rounded-full border border-[#B08C3E] bg-[#F3EDE1] text-[13px] font-semibold text-[#B08C3E]">
                      {sponsor.logo_url ? (
                        <img
                          src={sponsor.logo_url}
                          alt={sponsor.name}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        getSponsorInitials(sponsor.name)
                      )}
                    </div>
                    <strong className="block text-[13px] font-semibold text-[#241E17]">
                      {sponsor.name}
                    </strong>
                    <span className="mt-1 block text-[11px] text-[#6B6152]">Patrocinador</span>
                  </div>
                ))
              ) : (
                <div className="col-span-2 rounded-md border border-[#1C2B3A]/10 bg-white p-4 text-center text-sm text-[#6B6152] md:col-span-4">
                  Ainda não há patrocinadores cadastrados.
                </div>
              )}
            </div>

            {/* Porta de entrada do patrocinador: não precisa ser membro. */}
            <a
              href={sponsorshipPath(props.church.public_code)}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#B08C3E] px-4 py-2 text-[13px] font-semibold text-[#8A6D2F] transition-colors hover:bg-[#F3EDE1]"
            >
              Quero patrocinar esta igreja
            </a>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className={`${props.cardClass} rounded-md border p-4`}>
              <h3 className="mb-3 text-base font-semibold">Pedido de oração</h3>
              <form action={submitPrayerRequestAction.bind(null, props.church.id)} className="space-y-3">
                <input name="name" placeholder="Seu nome (opcional)" className="w-full rounded-md border border-[#1C2B3A]/10 bg-transparent px-3 py-2 text-sm outline-none" />
                <textarea name="message" placeholder="Escreva seu pedido de oração" required className="min-h-24 w-full rounded-md border border-[#1C2B3A]/10 bg-transparent px-3 py-2 text-sm outline-none" />
                <Button type="submit" className={props.buttonClass}>
                  Enviar pedido
                </Button>
              </form>
            </div>

            <div className={`${props.cardClass} rounded-md border p-4`}>
              <h3 className="mb-3 text-base font-semibold">Inscrição em eventos</h3>
              <form action={submitEventSignupAction.bind(null, props.church.id)} className="space-y-3">
                <input name="event_name" placeholder="Nome do evento" required className="w-full rounded-md border border-[#1C2B3A]/10 bg-transparent px-3 py-2 text-sm outline-none" />
                <input name="person_name" placeholder="Seu nome" required className="w-full rounded-md border border-[#1C2B3A]/10 bg-transparent px-3 py-2 text-sm outline-none" />
                <input name="contact" placeholder="WhatsApp / telefone / email" required className="w-full rounded-md border border-[#1C2B3A]/10 bg-transparent px-3 py-2 text-sm outline-none" />
                <Button type="submit" className={props.buttonClass}>
                  Registrar presença
                </Button>
              </form>
            </div>

            <div className={`${props.cardClass} rounded-md border p-4 md:col-span-2 xl:col-span-1`}>
              <h3 className="mb-3 text-base font-semibold">Cadastro de visitante</h3>
              <form action={submitVisitorAction.bind(null, props.church.id)} className="space-y-3">
                <input name="name" placeholder="Nome completo" required className="w-full rounded-md border border-[#1C2B3A]/10 bg-transparent px-3 py-2 text-sm outline-none" />
                <input name="contact" placeholder="WhatsApp / telefone / email" required className="w-full rounded-md border border-[#1C2B3A]/10 bg-transparent px-3 py-2 text-sm outline-none" />
                <Button type="submit" className={props.buttonClass}>
                  Salvar visita
                </Button>
              </form>
            </div>
          </div>
        </main>

        <footer className="px-4 pb-10 pt-6 text-center sm:px-6">
          <p className="text-[11.5px] leading-relaxed text-[#6B6152]">
            {props.church.name} — {props.church.address ?? "Rua das Palmeiras, 210, Guaiçara/SP"}
          </p>
          <div className="mt-2 text-[10.5px] text-[#6B6152]/70">Página mantida por EverApps</div>
        </footer>
      </div>
    </div>
  );
}

export function ChurchPageClassico(props: ChurchPageTemplateProps) {
  return (
    <BaseChurchPage
      {...props}
      accentClass="bg-[#D9BE7E] text-[#1C2B3A]"
      surfaceClass="bg-[#1C2B3A] text-[#F3EDE1]"
      tintClass="bg-white/5"
      shellClass="bg-[#F3EDE1] text-[#241E17]"
      textClass="text-[#F3EDE1]"
      mutedClass="text-[#F3EDE1]/70"
      buttonClass="bg-[#6E2A34] hover:bg-[#5b222b] text-[#F3EDE1]"
      cardClass="bg-white"
    />
  );
}

export function ChurchPageClean(props: ChurchPageTemplateProps) {
  return (
    <BaseChurchPage
      {...props}
      accentClass="bg-[#3F5C4A] text-white"
      surfaceClass="bg-[#FCFCFA] text-slate-900"
      tintClass="bg-[#f2f7f2]"
      shellClass="bg-[#f7f6f3] text-slate-900"
      textClass="text-slate-900"
      mutedClass="text-slate-600"
      buttonClass="bg-[#3F5C4A] hover:bg-[#2f483a] text-white"
      cardClass="bg-white"
    />
  );
}

export function ChurchPageDark(props: ChurchPageTemplateProps) {
  return (
    <BaseChurchPage
      {...props}
      accentClass="bg-[#8FB59B] text-slate-950"
      surfaceClass="bg-[#14181C] text-white"
      tintClass="bg-white/5"
      shellClass="bg-[#101416] text-white"
      textClass="text-white"
      mutedClass="text-slate-300"
      buttonClass="bg-[#8FB59B] hover:bg-[#7aa58d] text-slate-950"
      cardClass="bg-[#1a1f24]"
    />
  );
}

export function ChurchPageRenderer(props: ChurchPageTemplateProps) {
  switch (props.templateSlug) {
    case "classico":
      return <ChurchPageClassico {...props} />;
    case "clean":
      return <ChurchPageClean {...props} />;
    case "dark":
    default:
      return <ChurchPageDark {...props} />;
  }
}

export const templatePreviewOptions = [
  { slug: "classico", label: "Clássico", hint: "Navy + vinho" },
  { slug: "clean", label: "Clean", hint: "Claro + sábia" },
  { slug: "dark", label: "Dark", hint: "Grafite + verde" },
] as const;
