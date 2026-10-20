"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface PontoGrafico {
  /** Rótulo curto do eixo (ex.: "27/09"). */
  rotulo: string;
  /** null = sem dado naquele ponto (ex.: domingo sem chamada). */
  valor: number | null;
  /** Texto do valor já formatado (ex.: "76,3%"). */
  valorTexto: string;
  /** Linha extra ao passar o mouse (ex.: "Culto de domingo · 38 de 50"). */
  detalhe?: string;
}

/** Até quantas colunas cabem com o número em cima e a data embaixo de cada uma. */
const MAX_COM_ROTULOS = 13;

/** Topo "redondo" do eixo para contagens: 1, 2, 4, 5, 8, 10, 20, 40, 50... */
function topoRedondo(maior: number): number {
  if (maior <= 4) return 4;
  const base = 10 ** Math.floor(Math.log10(maior));
  for (const m of [1, 2, 4, 5, 8, 10]) if (maior <= m * base) return m * base;
  return 10 * base;
}

/**
 * Gráfico de colunas pequeno, de UMA série ao longo do tempo. Sem
 * biblioteca: colunas em CSS. Uma série só, então sem legenda — o título diz
 * o que é.
 *
 * Referências de número: eixo à esquerda com linhas de grade (0 ao topo) e,
 * quando há poucas colunas, o valor em cima de cada uma e a data embaixo.
 * Passar o mouse (ou focar) numa coluna mostra o detalhe na linha de
 * leitura; "Ver em tabela" dá os mesmos números em texto.
 */
export function MiniBarChart({
  titulo,
  descricao,
  pontos,
  maximo,
  sufixo = "",
  vazio,
}: {
  titulo: string;
  descricao?: string;
  pontos: PontoGrafico[];
  /** Topo do eixo (ex.: 100 para percentual). Sem ele, um número redondo acima do maior valor. */
  maximo?: number;
  /** Unidade do eixo (ex.: "%"). */
  sufixo?: string;
  vazio: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const comDado = pontos.filter((p) => p.valor !== null);
  const topo = maximo ?? topoRedondo(Math.max(1, ...comDado.map((p) => p.valor ?? 0)));
  // Quatro faixas iguais: 0, 25%, 50%, 75% e o topo.
  const marcas = [4, 3, 2, 1, 0].map((i) => (topo / 4) * i);
  const poucas = pontos.length <= MAX_COM_ROTULOS;
  // Sem interação, a leitura mostra o ponto mais recente com dado.
  const ultimo = pontos.reduce((achado, p, i) => (p.valor !== null ? i : achado), -1);
  const foco = ativo ?? (ultimo >= 0 ? ultimo : null);
  const lido = foco !== null ? pontos[foco] : null;
  const numero = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${sufixo}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descricao ? <CardDescription>{descricao}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {comDado.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{vazio}</p>
        ) : (
          <>
            <p className="min-h-10 text-sm" aria-live="polite">
              {lido ? (
                <>
                  <span className="text-2xl font-semibold tabular-nums">{lido.valorTexto}</span>{" "}
                  <span className="text-muted-foreground">
                    em {lido.rotulo}
                    {lido.detalhe ? ` · ${lido.detalhe}` : ""}
                  </span>
                </>
              ) : null}
            </p>

            <div className="flex gap-2">
              {/* Eixo: os números de referência, alinhados às linhas de grade. */}
              <div
                className="flex h-44 flex-col justify-between pt-5 text-right text-[11px] leading-none text-muted-foreground tabular-nums"
                aria-hidden
              >
                {marcas.map((m) => (
                  <span key={m} className="-translate-y-1/2 last:translate-y-0">
                    {numero(m)}
                  </span>
                ))}
              </div>

              <div className="min-w-0 flex-1">
                {/* pt-5: espaço para o número em cima da coluna mais alta. */}
                <div className="relative h-44 pt-5">
                  <div className="absolute inset-x-0 top-5 bottom-0 flex flex-col justify-between" aria-hidden>
                    {marcas.map((m) => (
                      <span key={m} className={cn("border-t", m === 0 ? "border-border" : "border-dashed border-border/70")} />
                    ))}
                  </div>
                  <div
                    className="relative flex h-full items-end gap-0.5"
                    role="group"
                    aria-label={titulo}
                    onMouseLeave={() => setAtivo(null)}
                  >
                    {pontos.map((p, i) => (
                      <button
                        key={`${p.rotulo}-${i}`}
                        type="button"
                        // A coluna inteira é o alvo, não só a barra (barra baixa é difícil de acertar).
                        className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center rounded-t outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        onMouseEnter={() => setAtivo(i)}
                        onFocus={() => setAtivo(i)}
                        onBlur={() => setAtivo(null)}
                        aria-label={`${p.rotulo}: ${p.valor === null ? "sem dado" : p.valorTexto}${p.detalhe ? `, ${p.detalhe}` : ""}`}
                      >
                        {p.valor === null ? (
                          <span className="mb-1 size-1 rounded-full bg-muted-foreground/40" />
                        ) : (
                          <span
                            className={cn(
                              "relative w-full max-w-12 rounded-t-[4px] bg-chart-1 transition-opacity",
                              foco !== null && foco !== i ? "opacity-55" : "opacity-100",
                            )}
                            style={{ height: `${Math.max(1.5, (Math.min(p.valor, topo) / topo) * 100)}%` }}
                          >
                            {poucas || foco === i ? (
                              <span className="absolute inset-x-0 -top-4 text-center text-[11px] leading-none font-medium whitespace-nowrap text-foreground tabular-nums">
                                {p.valorTexto}
                              </span>
                            ) : null}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Datas: uma por coluna quando cabem; senão, só a primeira e a última. */}
                {poucas ? (
                  <div className="mt-1 flex gap-0.5 text-[11px] text-muted-foreground tabular-nums" aria-hidden>
                    {pontos.map((p, i) => (
                      <span
                        key={`${p.rotulo}-${i}`}
                        className={cn("min-w-0 flex-1 truncate text-center", foco === i && "font-medium text-foreground")}
                      >
                        {p.rotulo}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums" aria-hidden>
                    <span>{pontos[0]?.rotulo}</span>
                    <span>{pontos[pontos.length - 1]?.rotulo}</span>
                  </div>
                )}
              </div>
            </div>

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">Ver em tabela</summary>
              <table className="mt-2 w-full text-left tabular-nums">
                <tbody>
                  {pontos.map((p, i) => (
                    <tr key={`${p.rotulo}-${i}`} className="border-t">
                      <td className="py-1 pr-2">{p.rotulo}</td>
                      <td className="py-1 pr-2 text-foreground">{p.valor === null ? "—" : p.valorTexto}</td>
                      <td className="py-1">{p.detalhe ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
