import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Cake,
  CircleCheck,
  ClipboardCheck,
  HandHeart,
  HeartHandshake,
  Library,
  type LucideIcon,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { IconeDaTarefa, TarefaDoDia } from "@/lib/paraHoje";
import { cn } from "@/lib/utils";

const ICONES: Record<IconeDaTarefa, LucideIcon> = {
  chamada: ClipboardCheck,
  ebd: BookOpen,
  alerta: AlertTriangle,
  visita: HeartHandshake,
  oracao: HandHeart,
  revista: Library,
  aniversario: Cake,
  evento: CalendarDays,
};

/**
 * "Para hoje": a primeira coisa do Painel. Uma linha por pendência, com o
 * botão que leva direto para resolver; o urgente (o que é para agora) vem
 * primeiro e marcado. Sem pendência, diz que está tudo em dia.
 */
export function ParaHoje({ tarefas }: { tarefas: TarefaDoDia[] }) {
  return (
    <section aria-labelledby="para-hoje" className="rounded-xl border bg-card">
      <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h3 id="para-hoje" className="text-base font-semibold">
          Para hoje
        </h3>
        {tarefas.length > 0 ? (
          <span className="text-sm text-muted-foreground">
            {tarefas.length} {tarefas.length === 1 ? "coisa" : "coisas"} para ver
          </span>
        ) : null}
      </div>
      {tarefas.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
          <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden />
          Tudo em dia por aqui. Chamadas feitas e nenhum pedido esperando.
        </p>
      ) : (
        <ul className="divide-y">
          {tarefas.map((t) => {
            const Icone = ICONES[t.icone];
            return (
              <li
                key={t.chave}
                className={cn(
                  "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
                  t.urgente && "bg-amber-500/10",
                )}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                      t.urgente ? "bg-amber-500/20 text-amber-800 dark:text-amber-300" : "bg-primary/10 text-primary",
                    )}
                    aria-hidden
                  >
                    <Icone className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
                      {t.urgente ? <span className="sr-only">Agora: </span> : null}
                      {t.titulo}
                    </p>
                    {t.detalhe ? <p className="text-xs break-words text-muted-foreground">{t.detalhe}</p> : null}
                  </div>
                </div>
                {t.externo ? (
                  <a
                    href={t.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ size: "sm", variant: "outline" }),
                      "shrink-0 self-start sm:self-auto",
                    )}
                  >
                    {t.acao}
                  </a>
                ) : (
                  <Link
                    href={t.href}
                    className={cn(
                      buttonVariants({ size: "sm", variant: t.urgente ? "default" : "outline" }),
                      "shrink-0 self-start sm:self-auto",
                    )}
                  >
                    {t.acao}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
