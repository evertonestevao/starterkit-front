"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { PaginacaoLocal } from "@/components/paginacao-local";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { ESTADO_LABEL, formatarData } from "@/lib/acompanhamento";
import {
  PERIODO_PADRAO,
  chamadasDoPeriodo,
  filtrarChamadas,
  periodosDoHistorico,
  resumoDasChamadas,
  type ChamadaDoAluno,
} from "@/lib/ebdHistorico";
import { paginar } from "@/lib/paginacao";
import { cn } from "@/lib/utils";
import type { EstadoPresenca } from "@/types/acompanhamento";
import type { EbdTrimestre } from "@/types/ebd";
import { SeloFrequencia } from "./selo-frequencia";

/** Chamadas por página. */
const POR_PAGINA = 10;

const COR_DO_ESTADO: Record<EstadoPresenca, string> = {
  presente: "border-emerald-600/30 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  ausente: "border-red-600/30 bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  justificado: "border-amber-600/30 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
};

const rotuloDoEstado = (estado: EstadoPresenca) => (estado === "ausente" ? "Faltou" : ESTADO_LABEL[estado]);

/**
 * Resumo e chamadas do aluno. O período vale para os dois (começa nos últimos
 * 90 dias, o mesmo do selo da lista de alunos); a situação e a busca filtram
 * só a lista. O total do histórico inteiro fica sempre à vista.
 */
export function EbdChamadasDoAluno({
  aulas,
  trimestres,
  hoje,
}: {
  aulas: ChamadaDoAluno[];
  trimestres: EbdTrimestre[];
  /** AAAA-MM-DD. */
  hoje: string;
}) {
  const [periodoId, setPeriodoId] = useState(PERIODO_PADRAO);
  const [estado, setEstado] = useState<EstadoPresenca | "">("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const periodos = periodosDoHistorico(aulas, trimestres, hoje);
  const periodo = periodos.find((p) => p.id === periodoId) ?? periodos[0];
  const doPeriodo = chamadasDoPeriodo(aulas, periodo);
  const resumo = resumoDasChamadas(doPeriodo);
  const geral = resumoDasChamadas(aulas);
  const filtradas = filtrarChamadas(doPeriodo, { estado, busca });
  const pag = paginar(filtradas, pagina, POR_PAGINA);
  const filtrando = estado !== "" || busca.trim() !== "";

  const situacoes: Array<[EstadoPresenca | "", string, number]> = [
    ["", "Todas", doPeriodo.length],
    ["presente", "Presenças", resumo.presentes],
    ["ausente", "Faltas", resumo.faltas],
    ["justificado", "Justificadas", resumo.justificadas],
  ];

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Período</span>
            <select
              className={cn(selectClasses, "w-auto min-w-48")}
              value={periodo.id}
              onChange={(e) => {
                setPeriodoId(e.target.value);
                setPagina(1);
              }}
            >
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            {periodo.de && periodo.ate
              ? `${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
              : "Desde a primeira chamada"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero rotulo="Presenças" valor={resumo.presentes} />
          <Numero rotulo="Faltas" valor={resumo.faltas} />
          <Numero rotulo="Justificadas" valor={resumo.justificadas} />
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Frequência no período</p>
            <p className="mt-1">
              <SeloFrequencia percentual={resumo.percentual} presentes={resumo.presentes} faltas={resumo.faltas} />
            </p>
          </div>
        </div>

        {periodo.id !== "tudo" ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Em todo o histórico: {geral.presentes} {geral.presentes === 1 ? "presença" : "presenças"}, {geral.faltas}{" "}
            {geral.faltas === 1 ? "falta" : "faltas"}, {geral.justificadas}{" "}
            {geral.justificadas === 1 ? "justificada" : "justificadas"}
            <SeloFrequencia percentual={geral.percentual} presentes={geral.presentes} faltas={geral.faltas} />
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chamadas</CardTitle>
          <CardDescription>
            Cada domingo em que o aluno estava na chamada, do mais recente para o mais antigo. Falta justificada não
            entra na frequência.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtrar por situação">
              {situacoes.map(([valor, rotulo, quantos]) => (
                <button
                  key={valor || "todas"}
                  type="button"
                  role="radio"
                  aria-checked={estado === valor}
                  onClick={() => {
                    setEstado(valor);
                    setPagina(1);
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm tabular-nums",
                    estado === valor && "border-primary bg-primary/10 font-medium",
                  )}
                >
                  {rotulo} ({quantos})
                </button>
              ))}
            </div>
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar dia (04/10) ou lição"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(1);
                }}
                className="h-9 pl-8"
                aria-label="Buscar um dia ou uma lição"
              />
            </div>
          </div>

          {pag.itens.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {aulas.length === 0
                ? "Nenhuma chamada com este aluno ainda."
                : filtrando
                  ? "Nenhuma chamada com esse filtro."
                  : "Nenhuma chamada neste período. Escolha outro período acima."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-lg border">
              {pag.itens.map((a) => (
                <li
                  key={`${a.data}-${a.classeNome}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium tabular-nums">{formatarData(a.data)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.classeNome}
                      {a.licao ? ` · ${a.licao}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                      COR_DO_ESTADO[a.estado],
                    )}
                  >
                    {rotuloDoEstado(a.estado)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <PaginacaoLocal
            pagina={pag.pagina}
            totalPaginas={pag.totalPaginas}
            total={pag.total}
            onMudar={setPagina}
            rotulo="chamada"
          />
        </CardContent>
      </Card>
    </>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}
