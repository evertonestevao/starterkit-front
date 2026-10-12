"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PaginacaoLocal } from "@/components/paginacao-local";
import { Input } from "@/components/ui/input";
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { formatarData } from "@/lib/acompanhamento";
import { faixaDeFrequencia, idadeEm, type FaixaFrequencia } from "@/lib/ebd";
import { paginar } from "@/lib/paginacao";
import { normalizeSearch } from "@/lib/search";
import { mascaraTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";
import type { EbdAlunoDaIgreja, EbdResponsavel } from "@/types/ebd";
import { NaoMembroBadge, TirarDaClasse } from "./ebd-classe-acoes";
import { ResponsaveisBotao } from "./ebd-responsaveis";

/** Alunos por página. */
const POR_PAGINA = 20;

type FiltroPapel = "todos" | "professores" | "alunos";

/** Verde acima de 70%, amarelo de 40% a 70%, vermelho abaixo de 40%. */
const COR_DA_FAIXA: Record<FaixaFrequencia, string> = {
  alta: "border-emerald-600/30 bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
  media: "border-amber-600/30 bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  baixa: "border-red-600/30 bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  sem: "border-border bg-muted text-muted-foreground",
};

/** Selo com a % de presença do aluno na classe, no período. */
function FrequenciaBadge({ aluno }: { aluno: EbdAlunoDaIgreja }) {
  const faixa = faixaDeFrequencia(aluno.frequencia);
  const total = aluno.presentes + aluno.faltas;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
        COR_DA_FAIXA[faixa],
      )}
      title={
        faixa === "sem"
          ? "Sem chamada no período"
          : `${aluno.presentes} ${aluno.presentes === 1 ? "presença" : "presenças"} em ${total} ${total === 1 ? "aula" : "aulas"} (justificadas não contam)`
      }
    >
      {aluno.frequencia === null ? "sem chamada" : `${Math.round(aluno.frequencia)}%`}
    </span>
  );
}

/**
 * Todos os alunos da EBD numa lista só, com busca pelo nome e filtro por
 * classe, em páginas. O professor recebe só os das classes dele (quem decide
 * é o servidor). Uma linha por aluno, que funciona como cartão no celular.
 */
export function EbdAlunosLista({
  alunos,
  classes,
  responsaveis,
  gestao,
  hoje,
  periodo,
}: {
  /** De quando a quando a frequência foi contada. */
  periodo: { de: string; ate: string };
  alunos: EbdAlunoDaIgreja[];
  classes: Array<{ id: string; nome: string }>;
  /** Responsáveis por id do membro. */
  responsaveis: Record<string, EbdResponsavel[]>;
  /** Gestão da EBD: pode ligar um responsável a alguém de Membros. */
  gestao: boolean;
  /** AAAA-MM-DD, para a idade. */
  hoje: string;
}) {
  const [busca, setBusca] = useState("");
  const [classe, setClasse] = useState("");
  const [pagina, setPagina] = useState(1);
  const [papel, setPapel] = useState<FiltroPapel>("todos");
  const [faixa, setFaixa] = useState<"" | FaixaFrequencia>("");
  const temProfessor = alunos.some((a) => a.professor);

  const termo = normalizeSearch(busca);
  const filtrados = alunos.filter(
    (a) =>
      (!classe || a.classeId === classe) &&
      (!termo || normalizeSearch(a.nome).includes(termo)) &&
      (papel === "todos" || (papel === "professores" ? a.professor : !a.professor)) &&
      (!faixa || faixaDeFrequencia(a.frequencia) === faixa),
  );
  const pag = paginar(filtrados, pagina, POR_PAGINA);
  const mostrados = pag.itens;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar pelo nome"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(1);
            }}
            className="h-9 pl-8"
            aria-label="Buscar aluno"
          />
        </div>
        {classes.length > 1 ? (
          <select
            aria-label="Filtrar por classe"
            className={cn(selectClasses, "sm:w-56")}
            value={classe}
            onChange={(e) => {
              setClasse(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todas as classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {temProfessor ? (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtrar por professores">
            {(
              [
                ["todos", "Todos"],
                ["professores", "Só professores"],
                ["alunos", "Só alunos"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={papel === valor}
                onClick={() => {
                  setPapel(valor);
                  setPagina(1);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  papel === valor && "border-primary bg-primary/10 font-medium",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <select
          aria-label="Filtrar por frequência"
          className={cn(selectClasses, "sm:w-56")}
          value={faixa}
          onChange={(e) => {
            setFaixa(e.target.value as "" | FaixaFrequencia);
            setPagina(1);
          }}
        >
          <option value="">Todas as frequências</option>
          <option value="alta">Acima de 70%</option>
          <option value="media">De 40% a 70%</option>
          <option value="baixa">Abaixo de 40%</option>
          <option value="sem">Sem chamada</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        Frequência dos últimos 90 dias ({formatarData(periodo.de)} a {formatarData(periodo.ate)}): presenças sobre as
        aulas com chamada; falta justificada não conta.
      </p>

      <p className="text-xs text-muted-foreground" role="status">
        {filtrados.length === alunos.length
          ? `${alunos.length} ${alunos.length === 1 ? "aluno" : "alunos"}`
          : `${filtrados.length} de ${alunos.length} alunos`}
      </p>

      {mostrados.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {alunos.length === 0
            ? "Ninguém matriculado ainda. A matrícula é feita na página de cada classe."
            : "Ninguém encontrado."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {mostrados.map((a) => {
            const idade = idadeEm(a.nascimento, hoje);
            return (
              <li key={a.matriculaId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium">
                    {a.nome} <FrequenciaBadge aluno={a} />
                    {a.professor ? (
                      <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        Professor(a)
                      </span>
                    ) : null}
                    {!a.membroIgreja ? <NaoMembroBadge /> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <Link
                      href={`/dashboard/ebd/classes/${a.classeId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {a.classeNome}
                    </Link>
                    {[
                      idade !== null ? `${idade} anos` : null,
                      mascaraTelefone(a.whatsapp) || null,
                      `desde ${formatarData(a.desde)}`,
                    ]
                      .filter(Boolean)
                      .map((t) => ` · ${t}`)
                      .join("")}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1">
                  <ResponsaveisBotao
                    membro={{ id: a.membroId, nome: a.nome }}
                    responsaveis={responsaveis[a.membroId] ?? []}
                    cuidados={a.cuidados}
                    podeEscolherMembro={gestao}
                  />
                  <TirarDaClasse matriculaId={a.matriculaId} nome={a.nome} />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <PaginacaoLocal
        pagina={pag.pagina}
        totalPaginas={pag.totalPaginas}
        total={pag.total}
        onMudar={setPagina}
        rotulo="aluno"
      />
    </div>
  );
}
