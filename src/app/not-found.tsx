import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * 404 da aplicação inteira.
 *
 * Escrita para DOIS públicos, porque `notFound()` é chamado tanto em rotas do
 * painel quanto em /igreja/[public_code] — a página pública da igreja. Quem cai
 * aqui por um QR code impresso errado não faz ideia do que é um dashboard, e
 * mandá-lo "voltar ao painel" seria inútil. Daí o tom acolhedor, o caminho
 * para o início e a dica específica de quem procurava uma igreja.
 *
 * Usa tokens de tema (não hex chapado como a landing) para acompanhar o
 * claro e o escuro sem duplicar paleta.
 */

export const metadata: Metadata = {
  title: "Página não encontrada",
  description: "O endereço que você abriu não existe ou foi movido.",
};

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-5 py-16 text-foreground">
      {/* Halo decorativo: dá profundidade sem pesar. aria-hidden porque não
          carrega informação nenhuma para quem usa leitor de tela. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        <Link
          href="/"
          className="mb-12 flex items-center gap-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label={brand.name}
        >
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          {brand.name}
        </Link>

        {/* O número sozinho, sem nada por cima: é marca d'água, não ilustração. */}
        <span
          aria-hidden
          className="font-heading text-[7rem] leading-none font-semibold tracking-tight text-foreground/[0.07] select-none sm:text-[9rem]"
        >
          404
        </span>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Esta página não foi encontrada
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          O endereço pode ter mudado de lugar, ou o link pode ter vindo com
          alguma letra trocada. De todo modo, que bom que você chegou até aqui.
        </p>

        {/* O versículo é o respiro da página: entra como citação, separado por
            filetes, não como piada sobre link quebrado. É um convite, então a
            frase acima prepara o acolhimento em vez de pedir desculpa pelo
            erro. Texto na NVI: a linguagem contemporânea acolhe melhor o
            visitante que chega aqui pela primeira vez do que a mesóclise das
            traduções clássicas. */}
        <figure className="mt-10 w-full border-y py-7">
          <blockquote
            cite="https://www.bibliaonline.com.br/nvi/mt/11/28"
            className="text-base leading-7 text-balance text-foreground/90 italic sm:text-lg sm:leading-8"
          >
            “Venham a mim, todos os que estão cansados e sobrecarregados, e eu
            lhes darei descanso.”
          </blockquote>
          <figcaption className="mt-3 text-[0.7rem] font-medium tracking-[0.18em] text-primary uppercase">
            Mateus 11:28
          </figcaption>
        </figure>

        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "gap-2")}>
            Voltar para o início
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {/* Quem chegou por QR code impresso não tem histórico para voltar nem
            conta na plataforma: precisa saber o que fazer a seguir. */}
        <div className="mt-12 flex w-full items-start gap-3 rounded-xl border border-dashed p-4 text-left">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p className="text-xs leading-5 text-muted-foreground">
            <span className="font-medium text-foreground">
              Estava procurando uma igreja?
            </span>{" "}
            Cada igreja tem um endereço próprio. Confira o link direto com ela,
            ou escaneie novamente o QR code do material impresso.
          </p>
        </div>
      </div>
    </main>
  );
}
