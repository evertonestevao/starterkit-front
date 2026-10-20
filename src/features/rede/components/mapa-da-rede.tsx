"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { nomeNivel } from "@/lib/niveisRede";
import {
  agruparPorRamo,
  bateNoFiltro,
  filtrarGrupos,
  formatarPorcento,
  fraseDaRede,
  ordenarGrupos,
  saudeDaUnidade,
  serieSemanal,
  tendenciaDaPresenca,
  VARIACAO_MINIMA,
  type GrupoDaRede,
  type NivelDeSaude,
  type SemanaDaRede,
  type Tendencia,
  type UnidadeDaRede,
} from "@/lib/painelRede";
import { cn } from "@/lib/utils";
import { useNomesNiveis } from "@/providers/niveis-provider";
import type { ChurchTipo } from "@/types/database";

/**
 * A rede de relance: a situação numa frase, a proporção em uma barra e um
 * "mapa" com um bloco por igreja — cor pela situação, a presença em número
 * grande, para onde ela vai e o motivo, quando há. Tocar no bloco filtra o
 * painel por aquela igreja.
 *
 * A cor nunca fala sozinha: todo bloco traz a situação escrita.
 */

const NIVEIS: NivelDeSaude[] = ["boa", "atencao", "parada"];

/**
 * Rede grande não cabe inteira na tela: o mapa mostra os primeiros blocos (os
 * que mais precisam de atenção, pela ordenação) e o resto vem com "Listar mais".
 */
const RAMOS_DE_INICIO = 4;
const ABAIXO_DE_INICIO = 4;
const BLOCOS_DE_INICIO = 6;
const PASSO = 8;

const VISUAL: Record<NivelDeSaude, { rotulo: string; ponto: string; bloco: string; texto: string }> = {
  boa: {
    rotulo: "Bem",
    ponto: "bg-emerald-600",
    bloco: "border-emerald-600/40 bg-emerald-600/[0.06] hover:bg-emerald-600/10",
    texto: "text-emerald-800 dark:text-emerald-300",
  },
  atencao: {
    rotulo: "Pede atenção",
    ponto: "bg-amber-500",
    bloco: "border-amber-500/50 bg-amber-500/[0.08] hover:bg-amber-500/15",
    texto: "text-amber-800 dark:text-amber-300",
  },
  parada: {
    rotulo: "Parada",
    ponto: "bg-destructive",
    bloco: "border-destructive/50 bg-destructive/[0.06] hover:bg-destructive/10",
    texto: "text-destructive",
  },
};

/**
 * A presença das 12 semanas em uma linha miúda; semana sem registro interrompe
 * o traço. A escala é a da própria igreja (do menor ao maior valor, com folga),
 * porque aqui interessa o DESENHO — subindo, caindo, estável. O número está
 * escrito logo acima.
 */
function Tracinho({ valores }: { valores: Array<number | null> }) {
  const L = 120;
  const A = 28;
  const medidos = valores.filter((v): v is number => v !== null);
  if (medidos.length === 0) return <div className="h-7 text-xs text-muted-foreground">sem chamadas em 12 semanas</div>;

  // Folga mínima de 10 pontos para uma oscilação de 1% não parecer um abismo.
  const meio = (Math.min(...medidos) + Math.max(...medidos)) / 2;
  const metade = Math.max(10, (Math.max(...medidos) - Math.min(...medidos)) / 2 + 3);
  const piso = meio - metade;
  const x = (i: number) => (valores.length === 1 ? L / 2 : 3 + (i * (L - 6)) / (valores.length - 1));
  const y = (v: number) => A - 4 - ((v - piso) / (2 * metade)) * (A - 8);

  const trechos: string[] = [];
  let atual = "";
  let ultimo = -1;
  valores.forEach((v, i) => {
    if (v === null) {
      if (atual) trechos.push(atual);
      atual = "";
    } else {
      atual += `${atual ? " L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      ultimo = i;
    }
  });
  if (atual) trechos.push(atual);
  const traco = {
    fill: "none",
    stroke: "currentColor",
    vectorEffect: "non-scaling-stroke",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  return (
    <svg viewBox={`0 0 ${L} ${A}`} className="h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={trechos.join(" ")} strokeWidth="1.75" {...traco} />
      {/* O ponto final é um traço de comprimento zero: continua redondo mesmo com o SVG esticado. */}
      <path d={`M${x(ultimo).toFixed(1)} ${y(valores[ultimo] ?? 0).toFixed(1)} l0.01 0`} strokeWidth="6" {...traco} />
    </svg>
  );
}

function SeloDeTendencia({ tendencia }: { tendencia: Tendencia }) {
  if (tendencia.sentido === "sem_dados" || tendencia.delta === null) return null;
  const modulo = Math.abs(tendencia.delta);
  const pontos = modulo.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const rotulo = modulo === 1 ? "ponto" : "pontos";
  // Ao passar o mouse (ou para leitor de tela): de quanto para quanto.
  const deQuantoParaQuanto = `Presença nos cultos: ${formatarPorcento(tendencia.anterior)} nas 4 semanas anteriores, ${formatarPorcento(tendencia.atual)} nas últimas 4.`;
  const { Icone, texto, classe } =
    tendencia.sentido === "subiu"
      ? { Icone: ArrowUpRight, texto: `subiu ${pontos} ${rotulo}`, classe: "text-emerald-700 dark:text-emerald-400" }
      : tendencia.sentido === "caiu"
        ? { Icone: ArrowDownRight, texto: `caiu ${pontos} ${rotulo}`, classe: "text-destructive" }
        : { Icone: ArrowRight, texto: "estável", classe: "text-muted-foreground" };
  return (
    <span
      title={deQuantoParaQuanto}
      className={cn("inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap", classe)}
    >
      <Icone className="size-3.5" aria-hidden />
      {texto}
    </span>
  );
}

function Bloco({
  unidade,
  semanas,
  hoje,
  aoEscolher,
}: {
  unidade: UnidadeDaRede;
  semanas: SemanaDaRede[];
  hoje: string;
  aoEscolher: (churchId: string) => void;
}) {
  const nomes = useNomesNiveis();
  const saude = saudeDaUnidade(unidade, hoje);
  const visual = VISUAL[saude.nivel];
  const tendencia = tendenciaDaPresenca(semanas, unidade.churchId, hoje);
  const linha = serieSemanal(semanas, unidade.churchId, hoje).map((p) => p.cultoPresenca);

  return (
    <button
      type="button"
      onClick={() => aoEscolher(unidade.churchId)}
      className={cn(
        "flex h-full w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        visual.bloco,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Duas linhas, não reticências: o fim do nome é justamente o que distingue uma igreja da outra. */}
          <p className="line-clamp-2 text-sm leading-5 font-semibold break-words">{unidade.churchName}</p>
          <p className="text-xs text-muted-foreground">
            {nomeNivel(nomes, unidade.tipo as ChurchTipo)} · {unidade.membrosAtivos} membros
          </p>
        </div>
        <span className={cn("flex shrink-0 items-center gap-1.5 text-xs font-medium", visual.texto)}>
          <span className={cn("size-2 rounded-full", visual.ponto)} aria-hidden />
          {visual.rotulo}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl leading-none font-semibold tabular-nums">
          {formatarPorcento(unidade.cultoPresenca8s)}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">nos cultos</span>
        </p>
        <SeloDeTendencia tendencia={tendencia} />
      </div>

      <div className={visual.texto}>
        <Tracinho valores={linha} />
      </div>

      <p className="min-h-8 text-xs leading-4 text-muted-foreground">
        {saude.motivos.length === 0
          ? "Nenhum sinal de atenção."
          : `${saude.motivos[0]}${saude.motivos.length > 1 ? ` (+${saude.motivos.length - 1})` : ""}`}
      </p>
    </button>
  );
}

function ListarMais({ restam, aoClicar, oQue }: { restam: number; aoClicar: () => void; oQue: string }) {
  if (restam <= 0) return null;
  return (
    <Button type="button" variant="outline" size="sm" onClick={aoClicar} className="self-start">
      <ChevronDown className="size-4" aria-hidden />
      Listar mais {oQue} ({restam})
    </Button>
  );
}

/** Um ramo: a igreja de cima e, ao lado, as que estão ligadas a ela — as primeiras, com "Listar mais". */
function Ramo({
  grupo,
  semanas,
  hoje,
  aoEscolher,
}: {
  grupo: GrupoDaRede;
  semanas: SemanaDaRede[];
  hoje: string;
  aoEscolher: (churchId: string) => void;
}) {
  const [visiveis, setVisiveis] = useState(ABAIXO_DE_INICIO);
  const abaixo = grupo.abaixo.slice(0, visiveis);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      {/* Igreja de cima que não bateu no filtro fica apagada: está ali só para dizer de quem são as de baixo. */}
      <div className={cn("self-start", grupo.deContexto && "opacity-50")}>
        <Bloco unidade={grupo.unidade} semanas={semanas} hoje={hoje} aoEscolher={aoEscolher} />
      </div>
      {grupo.abaixo.length > 0 ? (
        <div className="flex flex-col gap-3 border-l-2 border-dashed pl-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {abaixo.map((u) => (
              <Bloco key={u.churchId} unidade={u} semanas={semanas} hoje={hoje} aoEscolher={aoEscolher} />
            ))}
          </div>
          <ListarMais
            restam={grupo.abaixo.length - abaixo.length}
            aoClicar={() => setVisiveis((n) => n + PASSO)}
            oQue={`de ${grupo.unidade.churchName}`}
          />
        </div>
      ) : null}
    </div>
  );
}

export function MapaDaRede({
  unidades,
  semanas,
  hoje,
  saude,
  aoEscolher,
}: {
  unidades: UnidadeDaRede[];
  semanas: SemanaDaRede[];
  hoje: string;
  saude: Record<NivelDeSaude, number>;
  aoEscolher: (churchId: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [nivel, setNivel] = useState<NivelDeSaude | null>(null);
  const [visiveis, setVisiveis] = useState<number | null>(null);

  const total = unidades.length;
  const todos = useMemo(() => ordenarGrupos(agruparPorRamo(unidades), hoje), [unidades, hoje]);
  const temAndares = todos.some((g) => g.abaixo.length > 0);
  const grupos = useMemo(() => filtrarGrupos(todos, busca, nivel, hoje), [todos, busca, nivel, hoje]);
  const encontradas = unidades.filter((u) => bateNoFiltro(u, busca, nivel, hoje)).length;
  const limite = visiveis ?? (temAndares ? RAMOS_DE_INICIO : BLOCOS_DE_INICIO);
  const naTela = grupos.slice(0, limite);
  const geral = tendenciaDaPresenca(semanas, null, hoje);
  const filtrando = busca.trim() !== "" || nivel !== null;

  // Mudou a busca ou o filtro: a lista recomeça do início.
  function aoFiltrar(acao: () => void) {
    acao();
    setVisiveis(null);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-lg font-semibold tracking-tight sm:text-xl">{fraseDaRede(saude)}</p>
            {geral.sentido !== "sem_dados" ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Presença nos cultos no último mês: <SeloDeTendencia tendencia={geral} />
              </p>
            ) : null}
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            {NIVEIS.map((n) =>
              saude[n] > 0 ? (
                <div key={n} className={VISUAL[n].ponto} style={{ width: `${(100 * saude[n]) / total}%` }} />
              ) : null,
            )}
          </div>
        </div>

        {/* Busca pelo nome e filtro pela situação (os contadores são os botões). */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar pela situação">
            <button
              type="button"
              aria-pressed={nivel === null}
              onClick={() => aoFiltrar(() => setNivel(null))}
              className={cn(
                "rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                nivel === null
                  ? "border-foreground/40 bg-muted font-medium"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              Todas <span className="tabular-nums">{total}</span>
            </button>
            {NIVEIS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={nivel === n}
                disabled={saude[n] === 0}
                onClick={() => aoFiltrar(() => setNivel(nivel === n ? null : n))}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  nivel === n ? "border-foreground/40 bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <span className={cn("size-2.5 rounded-full", VISUAL[n].ponto)} aria-hidden />
                {VISUAL[n].rotulo} <span className="tabular-nums">{saude[n]}</span>
              </button>
            ))}
          </div>
          <div className="relative sm:w-72">
            <Search
              className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={busca}
              onChange={(e) => aoFiltrar(() => setBusca(e.target.value))}
              placeholder="Buscar igreja no mapa"
              aria-label="Buscar igreja no mapa"
              className="pl-8"
            />
          </div>
        </div>

        {filtrando ? (
          <p className="text-sm text-muted-foreground" role="status">
            {encontradas === 0
              ? "Nenhuma igreja com esse nome ou nessa situação."
              : `${encontradas} de ${total} ${total === 1 ? "igreja" : "igrejas"}.`}{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() =>
                aoFiltrar(() => {
                  setBusca("");
                  setNivel(null);
                })
              }
            >
              Limpar
            </button>
          </p>
        ) : null}

        {temAndares ? (
          // Cada igreja logo abaixo, com as que estão ligadas a ela ao lado.
          <div className="flex flex-col gap-4">
            {naTela.map((grupo) => (
              // A chave leva o filtro: ao filtrar, o "listar mais" de dentro do ramo recomeça.
              <Ramo
                key={`${grupo.unidade.churchId}-${busca}-${nivel ?? ""}`}
                grupo={grupo}
                semanas={semanas}
                hoje={hoje}
                aoEscolher={aoEscolher}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {naTela.map((grupo) => (
              <Bloco
                key={grupo.unidade.churchId}
                unidade={grupo.unidade}
                semanas={semanas}
                hoje={hoje}
                aoEscolher={aoEscolher}
              />
            ))}
          </div>
        )}
        <ListarMais
          restam={grupos.length - naTela.length}
          aoClicar={() => setVisiveis(limite + PASSO)}
          oQue="igrejas"
        />

        {/* Como ler: nada aqui depende de adivinhar o que a cor, a seta ou os "pontos" querem dizer. */}
        <div className="rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          <p className="font-medium text-foreground">Como ler</p>
          <dl className="mt-1 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <div>
              <dt className="inline font-medium text-foreground">Número grande: </dt>
              <dd className="inline">a presença nos cultos nas últimas 8 semanas.</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Subiu ou caiu tantos pontos: </dt>
              <dd className="inline">
                a diferença entre a presença das últimas 4 semanas e a das 4 semanas anteriores.
                {geral.delta !== null && geral.sentido !== "estavel"
                  ? ` Na rede, ela foi de ${formatarPorcento(geral.anterior)} para ${formatarPorcento(geral.atual)}: ${
                      geral.sentido === "subiu" ? "subiu" : "caiu"
                    } ${Math.abs(geral.delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} pontos.`
                  : " Por exemplo, de 80% para 74% são 6 pontos a menos."}{" "}
                Menos de {VARIACAO_MINIMA} pontos de diferença aparece como estável.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Linha: </dt>
              <dd className="inline">
                o desenho da presença nas últimas 12 semanas, na escala da própria igreja. Serve para ver se sobe ou
                cai, não para comparar uma igreja com outra.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Parada: </dt>
              <dd className="inline">sem culto nem EBD registrados há mais de 45 dias.</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Pede atenção: </dt>
              <dd className="inline">
                presença abaixo de 60%, muitas faltas seguidas, pedido de visita sem contato, registro atrasado ou
                mensalidade pendente.
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Ordem: </dt>
              <dd className="inline">quem mais precisa de atenção aparece primeiro; as demais vêm no “Listar mais”.</dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Para ver uma igreja: </dt>
              <dd className="inline">toque no bloco dela.</dd>
            </div>
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}
