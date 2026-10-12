import { faixaDeFrequencia, type FaixaFrequencia } from "@/lib/ebd";
import { cn } from "@/lib/utils";

/** Verde acima de 70%, amarelo de 40% a 70%, vermelho abaixo de 40%. */
const COR_DA_FAIXA: Record<FaixaFrequencia, string> = {
  alta: "border-emerald-600/30 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  media: "border-amber-600/30 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  baixa: "border-red-600/30 bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  sem: "border-border bg-muted text-muted-foreground",
};

/** Selo com a % de presença (presenças ÷ presenças + faltas; justificada não conta). */
export function SeloFrequencia({
  percentual,
  presentes,
  faltas,
}: {
  percentual: number | null;
  presentes: number;
  faltas: number;
}) {
  const faixa = faixaDeFrequencia(percentual);
  const total = presentes + faltas;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
        COR_DA_FAIXA[faixa],
      )}
      title={
        faixa === "sem"
          ? "Sem chamada no período"
          : `${presentes} ${presentes === 1 ? "presença" : "presenças"} em ${total} ${total === 1 ? "aula" : "aulas"} (justificadas não contam)`
      }
    >
      {percentual === null ? "sem chamada" : `${Math.round(percentual)}%`}
    </span>
  );
}
