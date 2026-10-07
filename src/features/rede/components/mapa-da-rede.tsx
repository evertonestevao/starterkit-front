"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { nomeNivel } from "@/lib/niveisRede";
import {
  agruparPorRamo,
  formatarPorcento,
  fraseDaRede,
  saudeDaUnidade,
  serieSemanal,
  tendenciaDaPresenca,
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
  const pontos = Math.abs(tendencia.delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const { Icone, texto, classe } =
    tendencia.sentido === "subiu"
      ? { Icone: ArrowUpRight, texto: `subiu ${pontos} pts`, classe: "text-emerald-700 dark:text-emerald-400" }
      : tendencia.sentido === "caiu"
        ? { Icone: ArrowDownRight, texto: `caiu ${pontos} pts`, classe: "text-destructive" }
        : { Icone: ArrowRight, texto: "estável", classe: "text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap", classe)}>
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
          <p className="truncate text-sm font-semibold">{unidade.churchName}</p>
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
  const total = unidades.length;
  const grupos = agruparPorRamo(unidades);
  const temAndares = grupos.some((g) => g.abaixo.length > 0);
  const geral = tendenciaDaPresenca(semanas, null, hoje);

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
            {NIVEIS.map((nivel) =>
              saude[nivel] > 0 ? (
                <div
                  key={nivel}
                  className={VISUAL[nivel].ponto}
                  style={{ width: `${(100 * saude[nivel]) / total}%` }}
                />
              ) : null,
            )}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {NIVEIS.map((nivel) => (
              <li key={nivel} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", VISUAL[nivel].ponto)} aria-hidden />
                <span className="font-medium tabular-nums">{saude[nivel]}</span>
                <span className="text-muted-foreground">{VISUAL[nivel].rotulo.toLocaleLowerCase("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </div>

        {temAndares ? (
          // Cada igreja logo abaixo, com as que estão ligadas a ela ao lado.
          <div className="flex flex-col gap-4">
            {grupos.map((grupo) => (
              <div key={grupo.unidade.churchId} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <Bloco unidade={grupo.unidade} semanas={semanas} hoje={hoje} aoEscolher={aoEscolher} />
                {grupo.abaixo.length > 0 ? (
                  <div className="grid gap-3 border-l-2 border-dashed pl-3 sm:grid-cols-2">
                    {grupo.abaixo.map((u) => (
                      <Bloco key={u.churchId} unidade={u} semanas={semanas} hoje={hoje} aoEscolher={aoEscolher} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {grupos.map((grupo) => (
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

        <p className="text-xs text-muted-foreground">
          Toque em uma igreja para ver só os números dela. Parada: sem culto nem EBD registrados há mais de 45 dias.
          Pede atenção: presença baixa, muitas faltas seguidas, pedido de visita sem contato, registro atrasado ou
          mensalidade pendente. A linha mostra a presença nos cultos nas últimas 12 semanas.
        </p>
      </CardContent>
    </Card>
  );
}
