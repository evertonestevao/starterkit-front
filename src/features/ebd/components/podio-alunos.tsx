"use client";

import { useState } from "react";
import Link from "next/link";
import { formatarPercentual } from "@/lib/acompanhamento";
import type { LugarNoPodio } from "@/lib/ebdDestaques";
import { cn } from "@/lib/utils";

/** Acima disto, o bloco mostra só os primeiros e um "mostrar todos". */
const VISIVEIS = 20;

const MEDALHA = ["🥇", "🥈", "🥉"];

/**
 * Pódio dos alunos mais assíduos: um bloco por colocação (1º, 2º e 3º), com
 * TODOS os empatados dentro — ninguém fica de fora por causa de um corte, e
 * o percentual aparece uma vez por bloco em vez de se repetir em cada linha.
 */
export function PodioAlunos({
  lugares,
  mostrarClasse,
}: {
  lugares: LugarNoPodio[];
  /** Com uma classe filtrada, o nome dela já está no título: não repete em cada aluno. */
  mostrarClasse: boolean;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {lugares.map((lugar) => (
        <Lugar key={lugar.posicao} lugar={lugar} mostrarClasse={mostrarClasse} />
      ))}
    </ol>
  );
}

function Lugar({ lugar, mostrarClasse }: { lugar: LugarNoPodio; mostrarClasse: boolean }) {
  const [todos, setTodos] = useState(false);
  const alunos = todos ? lugar.alunos : lugar.alunos.slice(0, VISIVEIS);
  const escondidos = lugar.alunos.length - alunos.length;

  return (
    <li className={cn("rounded-lg border p-3", lugar.posicao === 1 && "border-primary/40 bg-primary/5")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold">
          <span aria-hidden>{MEDALHA[lugar.posicao - 1] ?? ""}</span> {lugar.posicao}º lugar
        </h4>
        <p className="text-sm text-muted-foreground">
          <strong className="text-base font-semibold text-foreground tabular-nums">
            {formatarPercentual(lugar.percentual)}
          </strong>{" "}
          de presença · {lugar.alunos.length} {lugar.alunos.length === 1 ? "aluno" : "alunos"}
        </p>
      </div>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {alunos.map((a) => (
          <li key={a.membroId}>
            <Link
              href={`/dashboard/membros/${a.membroId}`}
              title={`${a.presentes} presenças em ${a.presentes + a.ausentes} chamadas`}
              className="inline-flex items-baseline gap-1.5 rounded-full border bg-background px-2.5 py-1 text-sm hover:border-primary/40 hover:bg-muted"
            >
              <span className="font-medium">{a.nome}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {mostrarClasse ? `${a.classeNome} · ` : ""}
                {a.presentes} de {a.presentes + a.ausentes}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {lugar.alunos.length > VISIVEIS ? (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          className="mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
          aria-expanded={todos}
        >
          {todos ? "Mostrar menos" : `Mostrar todos (mais ${escondidos})`}
        </button>
      ) : null}
    </li>
  );
}
