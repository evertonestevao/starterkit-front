import { cn } from "@/lib/utils";

const SIGLAS: Array<[string, string]> = [
  ["P", "Presente"],
  ["A", "Ausente"],
  ["J", "Justificado"],
];

/**
 * Legenda das siglas da chamada e das tabelas de presença. Fica onde as
 * letras aparecem sozinhas: quem não usa o sistema todo dia não precisa
 * adivinhar o que é "J". `extras` soma abreviações da tabela em questão
 * (ex.: Matr. = Matriculados).
 */
export function LegendaPresenca({ extras = [], className }: { extras?: Array<[string, string]>; className?: string }) {
  return (
    <p className={cn("flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      <span className="sr-only">Legenda:</span>
      {[...SIGLAS, ...extras].map(([sigla, nome]) => (
        <span key={sigla}>
          <strong className="font-semibold text-foreground">{sigla}</strong> = {nome}
        </span>
      ))}
    </p>
  );
}
