"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarPercentual } from "@/lib/acompanhamento";
import { cn } from "@/lib/utils";

export interface LinhaFrequencia {
  key: string;
  nome: string;
  href: string;
  /** Texto pequeno ao lado do nome (ex.: classe, "não membro"). */
  detalhe?: string;
  presentes: number;
  justificados: number;
  ausentes: number;
  percentual: number | null;
}

type Coluna = "nome" | "presentes" | "justificados" | "ausentes" | "percentual";

const POR_PAGINA = [20, 50, 100, 200] as const;

const COLUNAS: Array<{ id: Coluna; rotulo: string; numero: boolean; largura?: string }> = [
  { id: "nome", rotulo: "Nome", numero: false },
  { id: "presentes", rotulo: "Presentes", numero: true, largura: "w-28" },
  { id: "justificados", rotulo: "Justificados", numero: true, largura: "w-32" },
  { id: "ausentes", rotulo: "Ausentes", numero: true, largura: "w-28" },
  { id: "percentual", rotulo: "Presença", numero: true, largura: "w-28" },
];

/** Cor da presença: ajuda a bater o olho em quem está faltando. */
function corPresenca(p: number | null) {
  if (p === null) return "text-muted-foreground";
  if (p >= 75) return "text-emerald-700 dark:text-emerald-400";
  if (p >= 50) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

/** Ordena; "sem presença" (null) fica sempre no fim, em qualquer direção. */
export function ordenarFrequencia(linhas: LinhaFrequencia[], coluna: Coluna, crescente: boolean): LinhaFrequencia[] {
  const sinal = crescente ? 1 : -1;
  return [...linhas].sort((a, b) => {
    if (coluna === "nome") return sinal * a.nome.localeCompare(b.nome, "pt-BR");
    const va = a[coluna];
    const vb = b[coluna];
    if (va === null && vb === null) return a.nome.localeCompare(b.nome, "pt-BR");
    if (va === null) return 1;
    if (vb === null) return -1;
    return sinal * (va - vb) || a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/**
 * Frequência por pessoa em colunas alinhadas, com ordenação (clique no título
 * da coluna) e paginação de até 200 por página. Tudo no navegador: a lista
 * já vem inteira da página. Usada na presença dos cultos e na EBD.
 */
export function FrequenciaTabela({ linhas, vazio }: { linhas: LinhaFrequencia[]; vazio: string }) {
  const [coluna, setColuna] = useState<Coluna>("nome");
  const [crescente, setCrescente] = useState(true);
  const [porPagina, setPorPagina] = useState<number>(50);
  const [pagina, setPagina] = useState(1);

  const ordenadas = useMemo(() => ordenarFrequencia(linhas, coluna, crescente), [linhas, coluna, crescente]);
  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / porPagina));
  const atual = Math.min(pagina, totalPaginas);
  const visiveis = ordenadas.slice((atual - 1) * porPagina, atual * porPagina);

  function ordenarPor(c: Coluna) {
    if (c === coluna) setCrescente((v) => !v);
    else {
      setColuna(c);
      // Números começam do maior (quem mais faltou / mais veio); nome, de A a Z.
      setCrescente(c === "nome");
    }
    setPagina(1);
  }

  if (linhas.length === 0) return <p className="text-sm text-muted-foreground">{vazio}</p>;

  const Seta = ({ c }: { c: Coluna }) =>
    c !== coluna ? (
      <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
    ) : crescente ? (
      <ArrowUp className="size-3.5" aria-hidden />
    ) : (
      <ArrowDown className="size-3.5" aria-hidden />
    );

  return (
    <div className="flex flex-col gap-3">
      {/* Celular: escolher a ordem por um seletor (não há cabeçalho de tabela). */}
      <div className="flex items-center gap-2 text-sm md:hidden">
        <label className="flex items-center gap-2 text-muted-foreground">
          Ordenar por
          <select
            className="h-8 rounded-md border bg-transparent px-2 text-foreground"
            value={`${coluna}:${crescente ? "asc" : "desc"}`}
            onChange={(e) => {
              const [c, d] = e.target.value.split(":") as [Coluna, string];
              setColuna(c);
              setCrescente(d === "asc");
              setPagina(1);
            }}
          >
            <option value="nome:asc">Nome (A–Z)</option>
            <option value="percentual:asc">Menor presença</option>
            <option value="percentual:desc">Maior presença</option>
            <option value="ausentes:desc">Mais ausências</option>
            <option value="presentes:desc">Mais presenças</option>
            <option value="justificados:desc">Mais justificados</option>
          </select>
        </label>
      </div>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUNAS.map((c) => (
                <TableHead
                  key={c.id}
                  className={cn(c.largura, c.numero && "text-right")}
                  aria-sort={c.id === coluna ? (crescente ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => ordenarPor(c.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                      c.numero && "flex-row-reverse",
                      c.id === coluna ? "text-foreground" : "",
                    )}
                    title={`Ordenar por ${c.rotulo.toLowerCase()}`}
                  >
                    {c.rotulo}
                    <Seta c={c.id} />
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((l) => (
              <TableRow key={l.key}>
                <TableCell>
                  <Link href={l.href} className="font-medium hover:underline">
                    {l.nome}
                  </Link>
                  {l.detalhe ? <span className="ml-2 text-xs text-muted-foreground">{l.detalhe}</span> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.presentes}</TableCell>
                <TableCell className="text-right tabular-nums">{l.justificados}</TableCell>
                <TableCell className="text-right tabular-nums">{l.ausentes}</TableCell>
                <TableCell className={cn("text-right font-semibold tabular-nums", corPresenca(l.percentual))}>
                  {formatarPercentual(l.percentual)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col divide-y md:hidden">
        {visiveis.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <Link href={l.href} className="block truncate font-medium hover:underline">
                {l.nome}
              </Link>
              <span className="text-xs tabular-nums text-muted-foreground">
                {l.presentes} presentes · {l.justificados} justif. · {l.ausentes} ausentes
                {l.detalhe ? ` · ${l.detalhe}` : ""}
              </span>
            </span>
            <span className={cn("shrink-0 text-base font-semibold tabular-nums", corPresenca(l.percentual))}>
              {formatarPercentual(l.percentual)}
            </span>
          </li>
        ))}
      </ul>

      <nav className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Paginação">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span>
            {(atual - 1) * porPagina + 1}–{Math.min(atual * porPagina, ordenadas.length)} de {ordenadas.length}
          </span>
          <label className="flex items-center gap-2 whitespace-nowrap">
            Por página
            <select
              className="h-8 rounded-md border bg-transparent px-2 text-foreground"
              value={porPagina}
              onChange={(e) => {
                setPorPagina(Number(e.target.value));
                setPagina(1);
              }}
            >
              {POR_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {totalPaginas > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              Página {atual} de {totalPaginas}
            </span>
            <Button type="button" variant="outline" size="sm" disabled={atual <= 1} onClick={() => setPagina(atual - 1)}>
              <ChevronLeft className="size-4" /> Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={atual >= totalPaginas}
              onClick={() => setPagina(atual + 1)}
            >
              Próxima <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </nav>
    </div>
  );
}
