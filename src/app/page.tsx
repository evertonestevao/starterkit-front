import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  Contact,
  FileText,
  HandCoins,
  HandHeart,
  HeartHandshake,
  IdCard,
  KeyRound,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageCircleHeart,
  Network,
  QrCode,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

const benefits = [
  {
    icon: HeartHandshake,
    title: "Para quem chega",
    description:
      "Uma página da igreja com a programação, os eventos, o pedido de oração e o pedido de visita, sempre disponível no celular.",
  },
  {
    icon: Users,
    title: "Para quem cuida",
    description:
      "Membros, presença nos cultos, Escola Dominical, tesouraria e visitas em um só lugar, com aviso de quem está faltando.",
  },
  {
    icon: LayoutDashboard,
    title: "Para quem lidera",
    description:
      "Um painel com números e gráficos, e cada pessoa da equipe vendo só o que o cargo dela precisa ver.",
  },
];

/** Os módulos do sistema, como a igreja os encontra no menu. */
const modules = [
  {
    icon: QrCode,
    title: "Página da igreja",
    description:
      "Endereço próprio com programação, eventos e contatos. Compartilhe por link, QR Code ou NFC e escolha o tema visual.",
  },
  {
    icon: Contact,
    title: "Membros e cargos",
    description:
      "Ficha completa de cada membro, busca, aniversariantes do mês e os cargos de cada um: pastor, diácono, secretário, professor e os que a igreja criar.",
  },
  {
    icon: FileText,
    title: "Cartas e declarações",
    description:
      "Carta de recomendação, carta de transferência e declaração de membro em PDF, com a assinatura do pastor e o texto que a igreja ajustar. O histórico de cada membro fica registrado.",
  },
  {
    icon: IdCard,
    title: "Carteirinha de membro",
    description:
      "Carteirinha com foto e QR Code, enviada por link ou impressa em PDF. Quem lê o código confere na hora se ela vale. A sede escolhe o modelo, as cores e a logo.",
  },
  {
    icon: ClipboardCheck,
    title: "Presença nos cultos",
    description:
      "Chamada pelo celular em poucos toques, justificativas e alerta de quem faltou várias vezes seguidas, com atalho para o WhatsApp.",
  },
  {
    icon: BookOpen,
    title: "Escola Dominical",
    description:
      "Classes, matrículas, chamada de cada professor, visitantes, lições do trimestre, relatório do domingo em PDF e os alunos mais assíduos.",
  },
  {
    icon: HandCoins,
    title: "Dízimos e ofertas",
    description:
      "Os dízimos com o nome de quem entregou e as ofertas de cada culto, com filtros e relatório do mês. A oferta da Escola Dominical fica em um caixa separado.",
  },
  {
    icon: HeartHandshake,
    title: "Quem quer visita",
    description:
      "Quem deseja a visita do pastor pede pela página. A equipe liga, combina o dia e registra quem foi e quando.",
  },
  {
    icon: HandHeart,
    title: "Pedidos de oração",
    description:
      "Os pedidos chegam pela página e ficam reservados à liderança da igreja, com aviso dos que ainda não foram lidos.",
  },
  {
    icon: CalendarDays,
    title: "Programação e eventos",
    description:
      "Cultos da semana e datas especiais sempre atualizados, e eventos com inscrição e lista de quem confirmou presença.",
  },
  {
    icon: Megaphone,
    title: "Campanhas",
    description:
      "Apresente a causa, defina a meta e mostre o avanço para a comunidade acompanhar até o fim.",
  },
  {
    icon: Network,
    title: "Rede de igrejas",
    description:
      "Sede, subsedes e congregações ligadas. A igreja de cima acompanha os números das demais, sem ver os dados pessoais dos membros.",
  },
  {
    icon: KeyRound,
    title: "Acessos por cargo",
    description:
      "O pastor decide o que cada cargo pode usar. O professor vê a classe dele; a secretaria, o que é da secretaria.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Painel e relatórios",
    description:
      "Presença por culto e por domingo em gráficos, frequência de cada pessoa e os destaques do trimestre.",
  },
  {
    icon: ShieldCheck,
    title: "Cuidado com os dados",
    description:
      "Termo de consentimento impresso para o membro assinar, de acordo com a LGPD. As fotos ficam em área reservada e cada igreja só enxerga os próprios dados.",
  },
];

const steps = [
  [
    "01",
    "Sua igreja ganha uma página",
    "Nome, endereço, programação e identidade prontos para compartilhar em qualquer canal.",
  ],
  [
    "02",
    "A comunidade encontra caminhos",
    "Quem chega escolhe como se aproximar: pedir oração, pedir uma visita ou se inscrever em um evento.",
  ],
  [
    "03",
    "A equipe acompanha de perto",
    "Chamada nos cultos e na Escola Dominical, visitas registradas, a tesouraria em dia e um painel que mostra quem precisa de atenção.",
  ],
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#f8f7f2] text-[#243128]">
      <header className="relative z-20 border-b border-[#dfe5d8]/70 bg-[#f8f7f2]/90 backdrop-blur-md">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label={brand.name}
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#41694b] text-[#f6e6ad]">
              <Sparkles className="size-4" />
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.03em]">
              {brand.name}
            </span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-5">
            <Link
              href="#como-funciona"
              className="hidden text-sm text-[#637066] hover:text-[#243128] sm:block"
            >
              Como funciona
            </Link>
            <Link
              href="#modulos"
              className="hidden text-sm text-[#637066] hover:text-[#243128] sm:block"
            >
              Recursos
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "border-[#cfd9cb] bg-transparent text-[#36543d] hover:bg-[#edf1e9]",
              )}
            >
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8 lg:pb-28 lg:pt-24">
          <div className="relative z-10 max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#d9dfd2] bg-[#eef2e8] px-3 py-1.5 text-xs font-medium tracking-[0.08em] text-[#54705a] uppercase">
              <span className="size-1.5 rounded-full bg-[#c39a3a]" />A
              plataforma para acolher e acompanhar a comunidade
            </div>
            <h1 className="max-w-[680px] text-[clamp(2.8rem,6vw,5.6rem)] font-semibold leading-[0.98] tracking-[-0.065em] text-[#243128]">
              A página da sua igreja e o cuidado com as pessoas, em um só lugar.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#637066] sm:text-xl">
              O{" "}
              <strong className="font-semibold text-[#36543d]">
                {brand.name}
              </strong>{" "}
              dá a qualquer igreja uma página pronta para a comunidade e as
              ferramentas do dia a dia da liderança e da secretaria: membros,
              presença nos cultos, Escola Dominical, dízimos e ofertas,
              carteirinha, visitas e eventos.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 rounded-xl bg-[#41694b] px-6 text-[15px] text-white shadow-[0_10px_25px_rgba(65,105,75,0.2)] hover:bg-[#34573d]",
                )}
              >
                Conhecer a plataforma <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#como-funciona"
                className="group inline-flex h-12 items-center gap-2 px-3 text-[15px] font-medium text-[#4c6653]"
              >
                Ver como funciona{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <p className="mt-5 text-xs text-[#7d897f]">
              Funciona no celular, sem exigir estrutura técnica própria.
            </p>
          </div>

          <div className="relative flex min-h-[480px] items-center justify-center lg:min-h-[560px]">
            <div className="absolute right-[4%] top-[7%] size-64 rounded-full bg-[#e4eadc] blur-3xl" />
            <div className="absolute bottom-[5%] left-[3%] size-40 rounded-full bg-[#f1e6c9] blur-3xl" />
            <div className="relative w-full max-w-[470px]">
              <div className="absolute -right-1 top-7 z-10 hidden w-52 -rotate-3 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_20px_45px_rgba(40,63,45,0.13)] sm:block">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#36543d]">
                  <MessageCircleHeart className="size-4 text-[#c39a3a]" /> Novo
                  pedido de visita
                </div>
                <p className="mt-2 text-xs leading-5 text-[#718075]">
                  Mariana gostaria de receber uma visita.
                </p>
              </div>
              <div className="relative overflow-hidden rounded-[2rem] border-[7px] border-[#d8dfd2] bg-white shadow-[0_28px_70px_rgba(43,67,47,0.18)]">
                <div className="flex items-center justify-between bg-[#41694b] px-6 pb-7 pt-5 text-white">
                  <div>
                    <p className="text-[10px] tracking-[0.2em] text-[#dce7d8] uppercase">
                      Página + gestão
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      Igreja Esperança
                    </p>
                  </div>
                  <div className="flex size-10 items-center justify-center rounded-full bg-[#f0d991] text-[#41694b]">
                    <Sparkles className="size-5" />
                  </div>
                </div>
                <div className="-mt-4 rounded-t-[1.5rem] bg-[#fbfcf9] px-5 pb-6 pt-5">
                  <p className="text-sm leading-6 text-[#637066]">
                    Um espaço vivo para a comunidade e uma visão clara para quem
                    cuida dela.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {[
                      [HeartHandshake, "Pedir oração"],
                      [CalendarDays, "Ver eventos"],
                      [Users, "Quero uma visita"],
                      [ChartNoAxesCombined, "Painel da igreja"],
                    ].map(([Icon, label]) => (
                      <div
                        key={label as string}
                        className="rounded-xl border border-[#e5ebe1] bg-white p-3.5"
                      >
                        <div className="flex size-8 items-center justify-center rounded-lg bg-[#edf3e9] text-[#41694b]">
                          <Icon className="size-4" />
                        </div>
                        <p className="mt-3 text-xs font-semibold text-[#35463a]">
                          {label as string}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-[#f3ebd5] px-4 py-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#79632c]">
                      <MapPin className="size-4" /> Rua da Comunidade, 84
                    </div>
                    <ArrowRight className="size-4 text-[#a48432]" />
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-8 -left-5 flex items-center gap-3 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-[0_18px_40px_rgba(40,63,45,0.12)] sm:-left-12">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#f3ebd5] text-[#a48432]">
                  <QrCode className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#35463a]">
                    Acesso por onde fizer sentido
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#89938a]">
                    Link, QR Code ou NFC
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="recursos"
          className="border-y border-[#e3e8df] bg-white/55"
        >
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
              <div>
                <p className="text-xs font-semibold tracking-[0.18em] text-[#a48432] uppercase">
                  Mais que uma página
                </p>
                <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#243128] sm:text-4xl">
                  Do primeiro contato ao cuidado de cada semana.
                </h2>
                <p className="mt-5 max-w-sm leading-7 text-[#718075]">
                  Sua igreja já transforma vidas no encontro presencial. Aqui
                  esse cuidado continua entre um encontro e outro, sem ninguém
                  passar despercebido.
                </p>
              </div>
              <div className="grid gap-8 sm:grid-cols-3">
                {benefits.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="border-t border-[#cfd9cb] pt-5">
                    <Icon className="size-6 text-[#41694b]" strokeWidth={1.7} />
                    <h3 className="mt-5 text-base font-semibold text-[#35463a]">
                      {title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[#718075]">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="modulos" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#a48432] uppercase">
              O que a igreja encontra
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#243128] sm:text-4xl">
              Tudo o que a secretaria e a liderança usam, no mesmo sistema.
            </h2>
            <p className="mt-5 leading-7 text-[#718075]">
              Comece pelo que a sua igreja precisa hoje. Cada parte funciona
              sozinha e conversa com as outras.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-[#dfe5d8] bg-white/70 p-5"
              >
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#edf3e9] text-[#41694b]">
                  <Icon className="size-5" strokeWidth={1.7} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-[#35463a]">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#718075]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#f0f3eb]">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24 lg:py-24">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[#a48432] uppercase">
                Mobilize o que importa
              </p>
              <h2 className="mt-4 max-w-lg text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#243128] sm:text-4xl">
                Toda grande obra começa com uma comunidade que acredita junto.
              </h2>
              <p className="mt-5 max-w-lg leading-7 text-[#718075]">
                Crie campanhas para reformas, missões, ações sociais ou qualquer
                sonho da igreja. Apresente a causa com clareza, convide as
                pessoas a participar e mostre o avanço até a meta.
              </p>
              <div className="mt-7 flex items-center gap-3 text-sm font-medium text-[#41694b]">
                <Megaphone className="size-5" />
                Mais transparência para a liderança. Mais confiança para a
                comunidade.
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-[#d8e1d3] bg-white p-5 shadow-[0_20px_50px_rgba(43,67,47,0.08)] sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.15em] text-[#a48432] uppercase">
                    Campanha em andamento
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#35463a]">
                    Um novo espaço para as crianças
                  </h3>
                </div>
                <span className="rounded-full bg-[#edf3e9] px-3 py-1 text-xs font-semibold text-[#41694b]">
                  68% alcançado
                </span>
              </div>
              <p className="mt-3 max-w-md text-sm leading-6 text-[#718075]">
                Cada passo aproxima a nossa comunidade de um lugar mais seguro,
                bonito e preparado para receber a próxima geração.
              </p>
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-[#e6ece2]">
                <div className="h-full w-[68%] rounded-full bg-[#c39a3a]" />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-[#35463a]">
                  Mais de dois terços do caminho
                </span>
                <span className="text-[#89938a]">Meta definida pela igreja</span>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-[#edf0ea] pt-5 text-xs text-[#718075]">
                <span className="rounded-lg bg-[#f7f8f5] px-3 py-2">
                  Página pública
                </span>
                <span className="rounded-lg bg-[#f7f8f5] px-3 py-2">
                  Notícias da campanha
                </span>
                <span className="rounded-lg bg-[#f7f8f5] px-3 py-2">
                  Acompanhamento da meta
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28"
        >
          <div className="flex flex-col justify-between gap-8 border-b border-[#dfe5d8] pb-12 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[#a48432] uppercase">
                Simples desde o primeiro dia
              </p>
              <h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#243128] sm:text-4xl">
                Comece pequeno. Acolha de verdade.
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-6 text-[#718075]">
              Uma estrutura clara para você cuidar do essencial e deixar a
              tecnologia trabalhar a favor da comunidade.
            </p>
          </div>
          <div className="grid gap-0 md:grid-cols-3">
            {steps.map(([number, title, description], index) => (
              <div
                key={number}
                className={`py-8 md:pr-10 ${index > 0 ? "border-t border-[#dfe5d8] md:border-l md:border-t-0 md:pl-10" : ""}`}
              >
                <span className="text-sm font-semibold text-[#b08d3a]">
                  {number}
                </span>
                <h3 className="mt-10 text-xl font-semibold tracking-[-0.03em] text-[#35463a]">
                  {title}
                </h3>
                <p className="mt-3 max-w-xs text-sm leading-6 text-[#718075]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-5 mb-20 overflow-hidden rounded-[2rem] bg-[#41694b] sm:mx-8 lg:mx-auto lg:max-w-7xl">
          <div className="relative px-7 py-14 sm:px-14 sm:py-16 lg:px-20">
            <div className="absolute -right-16 -top-32 size-80 rounded-full border-[40px] border-[#719371]/25" />
            <div className="relative max-w-2xl">
              <p className="text-xs font-semibold tracking-[0.18em] text-[#d9c17b] uppercase dark:text-primary-foreground/70">
                Comece pelo essencial
              </p>
              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
                Tecnologia a serviço do cuidado, do jeito que a sua igreja já
                trabalha.
              </h2>
              <p className="mt-5 max-w-lg leading-7 text-[#dce7d8]">
                Publique a página da igreja, cadastre os membros e faça a
                primeira chamada. O restante você liga quando a equipe
                precisar.
              </p>
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "mt-8 h-12 rounded-xl bg-[#f0d991] px-6 text-[#354b38] hover:bg-[#f7e6ae]",
                )}
              >
                Conhecer a plataforma <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dfe5d8] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-[#718075] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold text-[#41694b]">{brand.name}</span>
          <span>Página, secretaria e acompanhamento para igrejas.</span>
          <Link href="/terms/igreja" className="hover:text-[#243128]">
            Termos de Uso
          </Link>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  );
}
