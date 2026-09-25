"use client";

import { useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Church, House, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatChurchName } from "@/lib/churchName";
import { TIPO_LABEL } from "@/lib/churchLinks";
import {
  describeCongregations,
  filterNetwork,
  sortNetwork,
  summarizeNetwork,
  type NetworkEntry,
  type NetworkSort,
  type PastorsByChurch,
} from "@/lib/churchNetwork";
import { pastorLabel } from "@/lib/churchLeaders";
import { cn } from "@/lib/utils";
import type { ChurchTipo } from "@/types/database";
import type { ChurchLinkChurch, ChurchLinkNode } from "@/types/churchLinks";
import { EndLinkButton, MovePositionForm, selectClasses } from "./church-link-controls";

const TIPO_ICON: Record<ChurchTipo, typeof Church> = {
  sede: Church,
  subsede: Building2,
  congregacao: House,
};

/** Quantas igrejas cabem em cada página: com centenas, a tela continua do mesmo tamanho. */
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const PAGE_SIZE_PADRAO: PageSize = 10;
/** Só vale oferecer busca e ordenação quando a lista já é longa. */
const BUSCA_A_PARTIR_DE = 8;
/** Só vale mostrar o seletor de tamanho quando já sobraria uma segunda página no menor tamanho. */
const PAGINACAO_A_PARTIR_DE = PAGE_SIZE_OPTIONS[0];

function TipoIcon({ tipo }: { tipo: ChurchTipo }) {
  const Icon = TIPO_ICON[tipo];
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden>
      <Icon className="size-4" />
    </span>
  );
}

/** Uma congregação dentro do painel da subsede: nome e as ações da igreja-mãe. */
function CongregationRow({
  church,
  congregation,
  entry,
  destinos,
  destacada,
  pastor,
}: {
  church: ChurchLinkChurch;
  congregation: ChurchLinkNode;
  entry: NetworkEntry;
  destinos: ChurchLinkNode[];
  destacada: boolean;
  pastor: string | null;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 px-3 py-2",
        destacada && "bg-primary/5",
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <TipoIcon tipo={congregation.tipo} />
        <span className="min-w-0">
          <span className="block break-words">{formatChurchName(congregation.name, congregation.sobrenome)}</span>
          {pastor ? <span className="block text-xs text-muted-foreground">{pastor}</span> : null}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <MovePositionForm church={church} filhas={destinos} moving={congregation} currentParentId={entry.church.id} />
        <EndLinkButton churchId={congregation.id} label="Desfazer vínculo" />
      </span>
    </li>
  );
}

/**
 * Uma igreja ligada, numa linha só: nome, função e — se for subsede — quantas
 * congregações tem. Clicar abre o painel com as ações e as congregações dela,
 * para a lista continuar curta mesmo com centenas de igrejas.
 */
function NetworkRow({
  church,
  entry,
  nested,
  destinos,
  pastores,
}: {
  church: ChurchLinkChurch;
  entry: NetworkEntry;
  /** Congregações que bateram com a busca, para avisar por que esta subsede apareceu. */
  nested: ChurchLinkNode[];
  destinos: ChurchLinkNode[];
  pastores: PastorsByChurch;
}) {
  const [aberta, setAberta] = useState(false);
  const igreja = entry.church;
  const total = entry.congregacoes.length;
  const painelId = `painel-${igreja.id}`;
  const achadas = new Set(nested.map((c) => c.id));

  return (
    <li className="rounded-lg border">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={painelId}
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ChevronRight
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-90")}
          aria-hidden
        />
        <TipoIcon tipo={igreja.tipo} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium break-words">
            {formatChurchName(igreja.name, igreja.sobrenome)}
          </span>
          {pastorLabel(pastores[igreja.id]) ? (
            <span className="block text-xs text-muted-foreground">{pastorLabel(pastores[igreja.id])}</span>
          ) : null}
          {nested.length > 0 ? (
            <span className="block text-xs text-muted-foreground">
              Achada em: {nested.map((c) => formatChurchName(c.name, c.sobrenome)).join(", ")}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Badge variant="outline" className="hidden sm:inline-flex">
            {TIPO_LABEL[igreja.tipo]}
          </Badge>
          {igreja.tipo === "subsede" ? (
            <Badge variant={total > 0 ? "secondary" : "outline"}>{describeCongregations(total)}</Badge>
          ) : null}
        </span>
      </button>

      {aberta ? (
        <div id={painelId} className="flex flex-col gap-3 border-t p-3">
          <div className="flex flex-wrap items-center gap-2">
            <MovePositionForm church={church} filhas={destinos} moving={igreja} currentParentId={church.id} />
            <EndLinkButton churchId={igreja.id} label="Desfazer vínculo" />
          </div>

          {igreja.tipo === "subsede" ? (
            total > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">{describeCongregations(total)}</p>
                <ul className="flex flex-col divide-y rounded-lg border">
                  {entry.congregacoes.map((congregacao) => (
                    <CongregationRow
                      key={congregacao.id}
                      church={church}
                      congregation={congregacao}
                      entry={entry}
                      destinos={destinos}
                      destacada={achadas.has(congregacao.id)}
                      pastor={pastorLabel(pastores[congregacao.id])}
                    />
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Esta subsede ainda não tem congregações ligadas. Ela mesma pode convidá-las pelo painel dela.
              </p>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * As igrejas ligadas a esta, para uma rede de qualquer tamanho: totais no alto,
 * busca (pelo nome da igreja ou de uma congregação), ordenação por nome ou por
 * quem tem mais congregações, e a lista em páginas de 10 (padrão; a pessoa pode
 * escolher 25, 50 ou 100 por página).
 */
export function ChurchNetworkList({
  church,
  entries,
  pastores,
}: {
  church: ChurchLinkChurch;
  entries: NetworkEntry[];
  pastores: PastorsByChurch;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<NetworkSort>("nome");
  const [tamanhoPagina, setTamanhoPagina] = useState<PageSize>(PAGE_SIZE_PADRAO);
  const [pagina, setPagina] = useState(1);

  if (entries.length === 0) return null;

  const resultado = sortNetwork(filterNetwork(entries, busca, pastores), ordem);
  // A página é o que garante a altura: 70 ou 700 igrejas mostram, no máximo, o tamanho escolhido de cada vez.
  const totalPaginas = Math.max(1, Math.ceil(resultado.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const mostradas = resultado.slice((paginaAtual - 1) * tamanhoPagina, paginaAtual * tamanhoPagina);
  const resumo = summarizeNetwork(entries);
  // Destinos de uma mudança de função: as subsedes ligadas diretamente a esta igreja.
  const destinos = entries.map((e) => e.church);
  const comBusca = entries.length >= BUSCA_A_PARTIR_DE;
  const comPaginacao = entries.length > PAGINACAO_A_PARTIR_DE;

  return (
    <section className="flex flex-col gap-3" aria-label="Igrejas ligadas">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Igrejas ligadas ({entries.length})</h3>
        {resumo.text ? <p className="text-xs text-muted-foreground">{resumo.text}</p> : null}
      </div>

      {comBusca ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              aria-label="Buscar igreja, congregação ou pastor"
              placeholder="Buscar igreja, congregação ou pastor"
              className="h-9 w-full rounded-md border border-input bg-transparent pr-2.5 pl-8 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex gap-1" role="group" aria-label="Ordenar por">
            {(
              [
                ["nome", "A–Z"],
                ["congregacoes", "Mais congregações"],
              ] as const
            ).map(([valor, rotulo]) => (
              <Button
                key={valor}
                type="button"
                size="sm"
                variant={ordem === valor ? "secondary" : "outline"}
                aria-pressed={ordem === valor}
                onClick={() => {
                  setOrdem(valor);
                  setPagina(1);
                }}
              >
                {rotulo}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {resultado.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Nenhuma igreja encontrada para “{busca.trim()}”.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mostradas.map(({ entry, nested }) => (
            <NetworkRow
              key={entry.church.id}
              church={church}
              entry={entry}
              nested={nested}
              destinos={destinos}
              pastores={pastores}
            />
          ))}
        </ul>
      )}

      {comPaginacao ? (
        <nav className="flex flex-wrap items-center justify-between gap-2" aria-label="Paginação das igrejas ligadas">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Página {paginaAtual} de {totalPaginas} · {resultado.length} igreja{resultado.length === 1 ? "" : "s"}
            </span>
            <label className="flex items-center gap-1.5" htmlFor="tamanho-pagina">
              Mostrar
              <select
                id="tamanho-pagina"
                value={tamanhoPagina}
                onChange={(e) => {
                  setTamanhoPagina(Number(e.target.value) as PageSize);
                  setPagina(1);
                }}
                className={cn(selectClasses, "h-7 px-2 py-0")}
              >
                {PAGE_SIZE_OPTIONS.map((tamanho) => (
                  <option key={tamanho} value={tamanho}>
                    {tamanho}
                  </option>
                ))}
              </select>
              por página
            </label>
          </div>
          {totalPaginas > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={paginaAtual <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                className="gap-1"
              >
                <ChevronLeft className="size-4" aria-hidden />
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={paginaAtual >= totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                className="gap-1"
              >
                Próxima
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
