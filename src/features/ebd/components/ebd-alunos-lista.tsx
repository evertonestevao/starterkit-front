"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PaginacaoLocal } from "@/components/paginacao-local";
import { Input } from "@/components/ui/input";
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { formatarData } from "@/lib/acompanhamento";
import { idadeEm } from "@/lib/ebd";
import { paginar } from "@/lib/paginacao";
import { normalizeSearch } from "@/lib/search";
import { mascaraTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";
import type { EbdAlunoDaIgreja, EbdResponsavel } from "@/types/ebd";
import { NaoMembroBadge, TirarDaClasse } from "./ebd-classe-acoes";
import { ResponsaveisBotao } from "./ebd-responsaveis";

/** Alunos por página. */
const POR_PAGINA = 20;

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
}: {
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

  const termo = normalizeSearch(busca);
  const filtrados = alunos.filter(
    (a) => (!classe || a.classeId === classe) && (!termo || normalizeSearch(a.nome).includes(termo)),
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
                    {a.nome} {!a.membroIgreja ? <NaoMembroBadge /> : null}
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
