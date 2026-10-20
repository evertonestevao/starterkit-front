import Link from "next/link";
import { cn } from "@/lib/utils";

export interface ItemRanking {
  key: string;
  /** Posição no ranking (empatados repetem a mesma). Sem ela, usa a ordem da lista. */
  posicao?: number;
  nome: string;
  /** Texto pequeno ao lado do nome (ex.: "6 aulas"). */
  detalhe?: string;
  valor: number;
  /** Valor já formatado (ex.: "82,1%"). */
  valorTexto: string;
  href?: string;
}

/**
 * Ranking em barras horizontais: uma linha por item, do maior para o menor,
 * com a posição, o nome e o valor escritos — a barra só ajuda a comparar.
 * Uma série, uma cor; quem está em 1º (todos os empatados) fica com a cor cheia.
 */
export function RankingBarras({
  itens,
  maximo,
  vazio,
}: {
  itens: ItemRanking[];
  /** Fim da escala (ex.: 100 para percentual). Sem ele, o maior valor. */
  maximo?: number;
  vazio: string;
}) {
  if (itens.length === 0)
    return <p className="py-4 text-sm text-muted-foreground">{vazio}</p>;
  const topo = maximo ?? Math.max(1, ...itens.map((i) => i.valor));

  return (
    <ol className="flex flex-col gap-3">
      {itens.map((item, i) => {
        const posicao = item.posicao ?? i + 1;
        return (
          <li key={item.key} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="mr-2 inline-block w-5 text-right text-muted-foreground tabular-nums">
                  {posicao}º
                </span>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="font-medium hover:underline"
                  >
                    {item.nome}
                  </Link>
                ) : (
                  <span className="font-medium">{item.nome}</span>
                )}
                {item.detalhe ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {item.detalhe}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {item.valorTexto}
              </span>
            </div>
            <div className="ml-7 h-2 rounded-full bg-muted" aria-hidden>
              <div
                className={cn(
                  "h-2 rounded-full bg-chart-1",
                  posicao === 1 ? "opacity-100" : "opacity-55",
                )}
                style={{
                  width: `${Math.max(1, (Math.min(item.valor, topo) / topo) * 100)}%`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
