import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { mesVizinho, nomeDoMes } from "@/lib/tesouraria";
import { cn } from "@/lib/utils";

/** Mês anterior / seguinte por link. Não passa do mês atual: não há lançamento no futuro. */
export function MesNav({
  mes,
  mesAtual,
  basePath,
  params,
}: {
  mes: string;
  mesAtual: string;
  basePath: string;
  /** Outros filtros da URL, preservados ao trocar de mês. */
  params?: Record<string, string | undefined>;
}) {
  const href = (alvo: string) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v && k !== "mes") qs.set(k, v);
    qs.set("mes", alvo);
    return `${basePath}?${qs.toString()}`;
  };
  const botao = cn(buttonVariants({ variant: "outline", size: "icon" }), "size-8");
  const noAtual = mes >= mesAtual;

  return (
    <nav className="flex items-center gap-2 print:hidden" aria-label="Mês">
      <Link href={href(mesVizinho(mes, -1))} className={botao} aria-label="Mês anterior">
        <ChevronLeft className="size-4" />
      </Link>
      <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase">{nomeDoMes(mes)}</span>
      {noAtual ? (
        <span className={cn(botao, "pointer-events-none opacity-40")} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      ) : (
        <Link href={href(mesVizinho(mes, 1))} className={botao} aria-label="Mês seguinte">
          <ChevronRight className="size-4" />
        </Link>
      )}
    </nav>
  );
}
