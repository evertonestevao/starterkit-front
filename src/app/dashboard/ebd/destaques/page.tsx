import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, HandCoins, TrendingUp, UserPlus, type LucideIcon } from "lucide-react";
import { MiniBarChart } from "@/components/mini-bar-chart";
import { RankingBarras } from "@/components/ranking-barras";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarPercentual, hojeISO, percentualPresenca } from "@/lib/acompanhamento";
import { PodioAlunos } from "@/features/ebd/components/podio-alunos";
import { EbdDestaquesFiltros } from "@/features/ebd/components/ebd-destaques-filtros";
import { domingoSugerido, formatarReais } from "@/lib/ebd";
import {
  liderEm,
  periodoDestaque,
  podioDeAlunos,
  rankingDeClasses,
  totaisDoPeriodo,
  trimestresRecentes,
  variacao,
} from "@/lib/ebdDestaques";
import { cn } from "@/lib/utils";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { canGerirEbd } from "@/services/ebdService";

export const metadata: Metadata = { title: "Destaques da EBD" };

const decimal = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

/**
 * Destaques da EBD: o geral de um trimestre (a EBD anda por trimestre) em números,
 * gráficos e rankings — classe com maior presença, os alunos mais assíduos,
 * e a comparação com o trimestre anterior. Só a gestão da EBD: o professor vê
 * a própria classe nos Relatórios, sem ranking entre classes.
 */
export default async function EbdDestaquesPage({ searchParams }: { searchParams: Promise<{ trimestre?: string; classe?: string }> }) {
  const actor = await getEbdActorAutorizado();
  if (!actor || !canGerirEbd(actor.role, actor.podeGerirEbd)) notFound();

  const sp = await searchParams;
  const service = await getEbdService();
  const [trimestres, { classes: todasClasses }] = await Promise.all([service.trimestres(actor), service.classes(actor)]);
  // A EBD anda por trimestre: o do último domingo, ou o escolhido no seletor.
  const intervalo = periodoDestaque(trimestres, sp.trimestre, domingoSugerido(hojeISO()));
  // Classe: só vale se for uma das classes da igreja; senão, todas.
  const classe = todasClasses.find((c) => c.id === sp.classe) ?? null;
  const [atual, anterior] = await Promise.all([
    service.relatorio(actor, { de: intervalo.de, ate: intervalo.ate, classeId: classe?.id }),
    service.relatorio(actor, { de: intervalo.anterior.de, ate: intervalo.anterior.ate, classeId: classe?.id }),
  ]);

  // O relatório por classe vem sempre com todas: com filtro, fica só a escolhida.
  const daClasse = <T extends { classeId: string }>(linhas: T[]) =>
    classe ? linhas.filter((l) => l.classeId === classe.id) : linhas;
  const totais = totaisDoPeriodo(daClasse(atual.classes), atual.domingos);
  const antes = totaisDoPeriodo(daClasse(anterior.classes), anterior.domingos);
  const ranking = rankingDeClasses(daClasse(atual.classes));
  const podio = podioDeAlunos(atual.alunos);
  const maisPresenca = ranking[0] ?? null;
  const maisVisitantes = liderEm(ranking, (c) => c.visitantes);
  const maiorOferta = liderEm(ranking, (c) => c.ofertaCentavos);
  const maiorTurma = liderEm(ranking, (c) => c.mediaPresentes);
  const semDados = totais.domingos === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <EbdDestaquesFiltros
          trimestre={intervalo.id ?? ""}
          trimestres={trimestresRecentes(trimestres).map((t) => ({ id: t.id, nome: t.nome }))}
          classe={classe?.id ?? ""}
          classes={todasClasses.filter((c) => c.ativa || c.id === classe?.id).map((c) => ({ id: c.id, nome: c.nome }))}
        />
        <p className="text-xs text-muted-foreground">
          {classe ? `${classe.nome} · ` : "Todas as classes · "}
          {intervalo.nome} · {formatarData(intervalo.de)} a {formatarData(intervalo.ate)}
          {intervalo.revista ? ` · revista: ${intervalo.revista}` : ""} · comparado com {intervalo.anterior.nome}
        </p>
        {trimestres.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum trimestre cadastrado: usando o trimestre do calendário. Cadastre em{" "}
            <Link href="/dashboard/ebd/trimestres" className="underline-offset-4 hover:underline">
              Trimestres
            </Link>{" "}
            para escolher aqui.
          </p>
        ) : null}
      </div>

      {semDados ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {classe
            ? `Nenhuma chamada da classe ${classe.nome} neste trimestre ainda.`
            : "Nenhuma chamada da EBD neste trimestre ainda."}{" "}
          Os destaques aparecem depois do primeiro domingo com chamada.
        </p>
      ) : (
        <>
          {totais.domingos < 3 ? (
            <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
              <strong>Trimestre no começo.</strong> Há só {totais.domingos} domingo(s) com chamada, então as médias, a
              comparação com o trimestre anterior e os rankings ainda podem mudar bastante.
            </p>
          ) : null}
          <section aria-label="Números do trimestre" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero
              rotulo={classe ? "Presença da classe" : "Presença geral"}
              valor={formatarPercentual(totais.presenca)}
              delta={variacao(totais.presenca, antes.presenca)}
              unidade=" p.p."
            />
            <Numero
              rotulo="Presentes por domingo"
              valor={decimal(totais.mediaPresentes)}
              delta={variacao(totais.mediaPresentes, antes.mediaPresentes)}
              detalhe={`${totais.domingos} domingo(s) com chamada`}
            />
            <Numero
              rotulo="Visitantes"
              valor={String(totais.visitantes)}
              delta={antes.domingos > 0 ? totais.visitantes - antes.visitantes : null}
            />
            <Numero
              rotulo="Oferta"
              valor={formatarReais(totais.ofertaCentavos)}
              detalhe={classe ? "da classe no trimestre" : "somando todas as classes"}
            />
          </section>

          {classe ? null : (
          <section aria-label="Classes em destaque" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Destaque
              icon={Award}
              titulo="Maior presença"
              nome={maisPresenca?.nome}
              valor={maisPresenca ? formatarPercentual(maisPresenca.presenca) : null}
              href={maisPresenca ? `/dashboard/ebd/classes/${maisPresenca.classeId}` : undefined}
            />
            <Destaque
              icon={TrendingUp}
              titulo="Maior turma"
              nome={maiorTurma?.nome}
              valor={maiorTurma ? `${decimal(maiorTurma.mediaPresentes)} por aula` : null}
              href={maiorTurma ? `/dashboard/ebd/classes/${maiorTurma.classeId}` : undefined}
            />
            <Destaque
              icon={UserPlus}
              titulo="Mais visitantes"
              nome={maisVisitantes?.nome}
              valor={maisVisitantes ? `${maisVisitantes.visitantes} visitante(s)` : null}
              href={maisVisitantes ? `/dashboard/ebd/classes/${maisVisitantes.classeId}` : undefined}
            />
            <Destaque
              icon={HandCoins}
              titulo="Maior oferta"
              nome={maiorOferta?.nome}
              valor={maiorOferta ? formatarReais(maiorOferta.ofertaCentavos) : null}
              href={maiorOferta ? `/dashboard/ebd/classes/${maiorOferta.classeId}` : undefined}
            />
          </section>
          )}

          <MiniBarChart
            titulo="Presença por domingo"
            descricao={`Percentual de presença ${classe ? `da classe ${classe.nome}` : "de toda a EBD"} em cada domingo com chamada. Justificados ficam de fora.`}
            pontos={atual.domingos.slice(-26).map((d) => {
              const pct = percentualPresenca(d.presentes, d.ausentes);
              return {
                rotulo: formatarData(d.data).slice(0, 5),
                valor: pct,
                valorTexto: formatarPercentual(pct),
                detalhe: `${d.presentes} presentes, ${d.ausentes} ausentes, ${d.visitantes} visitante(s)`,
              };
            })}
            maximo={100}
            sufixo="%"
            vazio="Nenhuma chamada neste trimestre."
          />

          <div className={cn("grid gap-3", !classe && "lg:grid-cols-2")}>
            {classe ? null : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Classes por presença</CardTitle>
                <CardDescription>Da maior para a menor presença no trimestre.</CardDescription>
              </CardHeader>
              <CardContent>
                <RankingBarras
                  maximo={100}
                  vazio="Nenhuma classe teve aula no trimestre."
                  itens={ranking.map((c) => ({
                    key: c.classeId,
                    posicao: c.posicao,
                    nome: c.nome,
                    detalhe: `${c.aulas} aula(s) · ${decimal(c.mediaPresentes)} por aula`,
                    valor: c.presenca ?? 0,
                    valorTexto: formatarPercentual(c.presenca),
                    href: `/dashboard/ebd/classes/${c.classeId}`,
                  }))}
                />
              </CardContent>
            </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Alunos mais assíduos{classe ? ` · ${classe.nome}` : ""}
                </CardTitle>
                <CardDescription>
                  Os três primeiros lugares em presença, com todos os empatados em cada um. Entram os que tiveram pelo
                  menos {podio.minimo} chamadas no trimestre.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {podio.lugares.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">
                    Ainda não há alunos com chamadas suficientes no trimestre.
                  </p>
                ) : (
                  <PodioAlunos lugares={podio.lugares} mostrarClasse={!classe} />
                )}
                <Link
                  href={`/dashboard/ebd/relatorios?de=${intervalo.de}&ate=${intervalo.ate}${classe ? `&classe=${classe.id}` : ""}`}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ver todos os alunos ({podio.elegiveis} com chamadas suficientes)
                </Link>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Quem está faltando aparece em{" "}
            <Link href="/dashboard/ebd/alertas" className="underline-offset-4 hover:underline">
              Em alerta
            </Link>
            ; a lista completa de alunos e classes, em{" "}
            <Link
              href={`/dashboard/ebd/relatorios?de=${intervalo.de}&ate=${intervalo.ate}${classe ? `&classe=${classe.id}` : ""}`}
              className="underline-offset-4 hover:underline"
            >
              Relatórios
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

/** Número geral do período, com a diferença para o período anterior (seta + texto, não só cor). */
function Numero({
  rotulo,
  valor,
  delta,
  unidade = "",
  detalhe,
}: {
  rotulo: string;
  valor: string;
  delta?: number | null;
  unidade?: string;
  detalhe?: string;
}) {
  const temDelta = delta !== null && delta !== undefined;
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{rotulo}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{valor}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {temDelta ? (
            <span
              className={cn(
                "font-medium tabular-nums",
                delta > 0 && "text-emerald-700 dark:text-emerald-400",
                delta < 0 && "text-red-700 dark:text-red-400",
              )}
            >
              {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "= "}
              {delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              {unidade}
            </span>
          ) : null}
          {temDelta ? " vs. trimestre anterior" : (detalhe ?? "sem trimestre anterior para comparar")}
          {temDelta && detalhe ? ` · ${detalhe}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

function Destaque({
  icon: Icon,
  titulo,
  nome,
  valor,
  href,
}: {
  icon: LucideIcon;
  titulo: string;
  nome?: string;
  valor: string | null;
  href?: string;
}) {
  const conteudo = (
    <div className="h-full rounded-xl border bg-background p-4">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className="size-4 text-primary" aria-hidden /> {titulo}
      </p>
      <p className="mt-2 truncate text-lg font-semibold">{nome ?? "—"}</p>
      <p className="text-sm text-muted-foreground tabular-nums">{valor ?? "sem registro no trimestre"}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-transform hover:-translate-y-0.5">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}
