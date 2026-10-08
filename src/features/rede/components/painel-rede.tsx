"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Contact,
  CreditCard,
  HeartHandshake,
  Network,
  Search,
  UserPlus,
  Wallet,
} from "lucide-react";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { LineChartCard } from "@/components/charts/line-chart-card";
import { EmptyState } from "@/components/empty-state";
import { MapaDaRede } from "@/features/rede/components/mapa-da-rede";
import { MetricCard } from "@/components/metric-card";
import { PaginacaoLocal } from "@/components/paginacao-local";
import { RankingBarras } from "@/components/ranking-barras";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData } from "@/lib/acompanhamento";
import { formatarReais } from "@/lib/ebd";
import { nomeNivel } from "@/lib/niveisRede";
import {
  buscarUnidades,
  formatarPorcento,
  porUrgencia,
  recorte,
  saudeDaUnidade,
  serieMensal,
  serieSemanal,
  totaisDaRede,
  type MensalidadeDaUnidade,
  type NivelDeSaude,
  type PainelDaRede,
  type UnidadeDaRede,
} from "@/lib/painelRede";
import { paginar } from "@/lib/paginacao";
import { cn } from "@/lib/utils";
import { useNomesNiveis } from "@/providers/niveis-provider";
import type { ChurchTipo } from "@/types/database";

const POR_PAGINA = 10;

const SAUDE: Record<NivelDeSaude, { rotulo: string; classe: string }> = {
  boa: {
    rotulo: "Bem",
    classe: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  },
  atencao: {
    rotulo: "Pede atenção",
    classe: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  parada: {
    rotulo: "Parada",
    classe: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

const MENSALIDADE: Record<MensalidadeDaUnidade, string> = {
  em_dia: "Em dia",
  coberta: "Coberta",
  pendente: "Pendente",
  suspensa: "Suspensa",
};

const PORCENTO = { style: "unit", unit: "percent", maximumFractionDigits: 1 } as const;
const REAIS = { style: "currency", currency: "BRL" } as const;

function SeloDeSaude({ nivel }: { nivel: NivelDeSaude }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        SAUDE[nivel].classe,
      )}
    >
      {SAUDE[nivel].rotulo}
    </span>
  );
}

/**
 * Painel da rede. Tudo o que chega aqui são números das igrejas de baixo; a
 * tela só soma, filtra e desenha. O filtro por unidade e a busca acontecem no
 * navegador — os dados já vieram todos, e trocar de unidade não vai ao servidor.
 */
export function PainelRede({ painel, hoje }: { painel: PainelDaRede; hoje: string }) {
  const nomes = useNomesNiveis();
  const [unidadeId, setUnidadeId] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);

  const { unidades, semanas, meses } = painel;
  const escolhida = unidades.find((u) => u.churchId === unidadeId) ?? null;
  const noRecorte = useMemo(() => recorte(unidades, unidadeId || null), [unidades, unidadeId]);
  const totais = useMemo(() => totaisDaRede(noRecorte, semanas, hoje), [noRecorte, semanas, hoje]);
  const porSemana = useMemo(() => serieSemanal(semanas, unidadeId || null, hoje), [semanas, unidadeId, hoje]);
  const porMes = useMemo(() => serieMensal(meses, unidadeId || null, hoje), [meses, unidadeId, hoje]);
  const lista = useMemo(() => porUrgencia(buscarUnidades(unidades, busca), hoje), [unidades, busca, hoje]);
  const paginaDaLista = paginar(lista, pagina, POR_PAGINA);
  const mostraMensalidade = unidades.some((u) => u.mensalidade !== null);
  const saudeDaEscolhida = escolhida ? saudeDaUnidade(escolhida, hoje) : null;
  const tipoDe = (u: UnidadeDaRede) => nomeNivel(nomes, u.tipo as ChurchTipo);

  function verUnidade(id: string) {
    setUnidadeId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (unidades.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title="Nenhuma igreja ligada"
        description="Quando uma igreja for ligada abaixo desta, os números dela aparecem aqui."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Recorte: a rede inteira, ou uma unidade. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-col gap-1.5 sm:w-80">
          <Label htmlFor="rede-unidade">Ver os números de</Label>
          <select
            id="rede-unidade"
            value={unidadeId}
            onChange={(e) => setUnidadeId(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Todas as igrejas ({unidades.length})</option>
            {unidades.map((u) => (
              <option key={u.churchId} value={u.churchId}>
                {"  ".repeat(Math.max(0, u.nivel - 1))}
                {u.churchName}
              </option>
            ))}
          </select>
        </div>
        {escolhida ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setUnidadeId("")}>
            Voltar para todas
          </Button>
        ) : null}
      </div>

      {/* De relance: a situação numa frase e o mapa das igrejas. */}
      {escolhida ? null : (
        <MapaDaRede unidades={unidades} semanas={semanas} hoje={hoje} saude={totais.saude} aoEscolher={verUnidade} />
      )}

      {escolhida && saudeDaEscolhida ? (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{escolhida.churchName}</span>
              <span className="text-sm text-muted-foreground">{tipoDe(escolhida)}</span>
              <SeloDeSaude nivel={saudeDaEscolhida.nivel} />
            </div>
            {saudeDaEscolhida.motivos.length > 0 ? (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {saudeDaEscolhida.motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum sinal de atenção nos números de hoje.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Última chamada de culto: {formatarData(escolhida.cultoUltimaChamada) || "nunca"} · Última aula da EBD:{" "}
              {formatarData(escolhida.ebdUltimaAula) || "nunca"} · Página pública:{" "}
              {escolhida.paginaAtiva ? "no ar" : "fora do ar"}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Contact}
          label="Membros ativos"
          value={totais.membrosAtivos}
          hint={`${totais.membrosNovos90d} entraram nos últimos 90 dias`}
        />
        <MetricCard
          icon={ClipboardCheck}
          label="Presença nos cultos"
          value={formatarPorcento(totais.presencaCultos)}
          hint={`últimas 8 semanas · ${totais.emAlerta} em alerta de faltas`}
        />
        <MetricCard
          icon={BookOpen}
          label="Presença na EBD"
          value={formatarPorcento(totais.presencaEbd)}
          hint={`últimas 8 semanas · ${totais.matriculadosEbd} matriculados`}
        />
        <MetricCard
          icon={UserPlus}
          label="Visitantes nos cultos"
          value={totais.visitantes30d}
          hint="nos últimos 30 dias"
        />
        <MetricCard
          icon={HeartHandshake}
          label="Pedidos de visita sem contato"
          value={totais.visitasSemContato}
          hint={`${totais.visitasFeitas90d} visitas feitas em 90 dias`}
        />
        <MetricCard
          icon={Wallet}
          label="Dízimos e ofertas do mês"
          value={formatarReais(totais.dizimosMesCents + totais.ofertasMesCents)}
          hint={`dízimos ${formatarReais(totais.dizimosMesCents)} · ofertas ${formatarReais(totais.ofertasMesCents)}`}
        />
        <MetricCard icon={CalendarDays} label="Próximos eventos" value={totais.eventosProximos} hint="já marcados" />
        {totais.mensalidadesPendentes !== null && !escolhida ? (
          <MetricCard
            icon={CreditCard}
            label="Mensalidades pendentes"
            value={totais.mensalidadesPendentes}
            hint="igrejas com pagamento em aberto"
          />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LineChartCard
          title="Presença por semana"
          description="Percentual de presentes nos cultos e na EBD, nas últimas 12 semanas. Semana sem registro fica em branco."
          data={porSemana}
          xKey="semana"
          series={[
            { key: "cultoPresenca", label: "Cultos" },
            { key: "ebdPresenca", label: "EBD" },
          ]}
          valueFormat={PORCENTO}
        />
        <BarChartCard
          title="Pessoas por semana"
          description="Quantos estiveram presentes nos cultos e na EBD, e os visitantes anotados nos cultos."
          data={porSemana}
          xKey="semana"
          series={[
            { key: "cultoPresentes", label: "Presentes nos cultos" },
            { key: "ebdPresentes", label: "Presentes na EBD" },
            { key: "visitantes", label: "Visitantes" },
          ]}
        />
        <BarChartCard
          title="Dízimos e ofertas por mês"
          description="Só o total de cada mês. Os lançamentos e os nomes ficam com a própria igreja."
          data={porMes}
          xKey="mes"
          series={[
            { key: "dizimos", label: "Dízimos" },
            { key: "ofertas", label: "Ofertas" },
          ]}
          valueFormat={REAIS}
        />
        <BarChartCard
          title="Membros novos por mês"
          description="Quantos membros ativos foram cadastrados em cada mês."
          data={porMes}
          xKey="mes"
          yKey="membrosNovos"
        />
        {!escolhida && unidades.length > 1 ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Presença nos cultos por igreja</CardTitle>
              <CardDescription>Últimas 8 semanas. Só entram as igrejas que fizeram chamada no período.</CardDescription>
            </CardHeader>
            <CardContent>
              <RankingBarras
                maximo={100}
                vazio="Nenhuma igreja registrou presença nas últimas 8 semanas."
                itens={unidades
                  .filter((u) => u.cultoPresenca8s !== null)
                  .sort((a, b) => (b.cultoPresenca8s ?? 0) - (a.cultoPresenca8s ?? 0))
                  .slice(0, 12)
                  .map((u) => ({
                    key: u.churchId,
                    nome: u.churchName,
                    detalhe: `${u.membrosAtivos} membros`,
                    valor: u.cultoPresenca8s ?? 0,
                    valorTexto: formatarPorcento(u.cultoPresenca8s),
                  }))}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* A lista: quem mais precisa de atenção primeiro. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Igrejas</CardTitle>
          <CardDescription>
            Quem mais precisa de atenção aparece primeiro. Toque em uma igreja para ver só os números dela.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative sm:max-w-sm">
            <Search
              className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              placeholder="Buscar igreja pelo nome"
              aria-label="Buscar igreja pelo nome"
              className="pl-8"
            />
          </div>

          {lista.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma igreja com esse nome.</p>
          ) : (
            <>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Igreja</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Membros</TableHead>
                      <TableHead className="text-right">Cultos</TableHead>
                      <TableHead className="text-right">EBD</TableHead>
                      <TableHead className="text-right">Em alerta</TableHead>
                      <TableHead className="text-right">Visitas a fazer</TableHead>
                      <TableHead className="text-right">Dízimos e ofertas</TableHead>
                      {mostraMensalidade ? <TableHead>Mensalidade</TableHead> : null}
                      <TableHead className="sr-only">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginaDaLista.itens.map((u) => {
                      const saude = saudeDaUnidade(u, hoje);
                      return (
                        <TableRow key={u.churchId}>
                          <TableCell>
                            <div className="font-medium">{u.churchName}</div>
                            <div className="text-xs text-muted-foreground">{tipoDe(u)}</div>
                          </TableCell>
                          <TableCell>
                            <SeloDeSaude nivel={saude.nivel} />
                            {saude.motivos[0] ? (
                              <div className="mt-1 max-w-56 text-xs whitespace-normal text-muted-foreground">
                                {saude.motivos[0]}
                                {saude.motivos.length > 1 ? ` (+${saude.motivos.length - 1})` : ""}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{u.membrosAtivos}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatarPorcento(u.cultoPresenca8s)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatarPorcento(u.ebdPresenca8s)}</TableCell>
                          <TableCell className="text-right tabular-nums">{u.cultoEmAlerta}</TableCell>
                          <TableCell className="text-right tabular-nums">{u.visitasSemContato}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatarReais(u.dizimosMesCents + u.ofertasMesCents)}
                          </TableCell>
                          {mostraMensalidade ? (
                            <TableCell>{u.mensalidade ? MENSALIDADE[u.mensalidade] : "—"}</TableCell>
                          ) : null}
                          <TableCell className="text-right">
                            <Button type="button" variant="outline" size="sm" onClick={() => verUnidade(u.churchId)}>
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Telas menores: um cartão por igreja. */}
              <ul className="flex flex-col gap-3 lg:hidden">
                {paginaDaLista.itens.map((u) => {
                  const saude = saudeDaUnidade(u, hoje);
                  return (
                    <li key={u.churchId} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{u.churchName}</p>
                          <p className="text-xs text-muted-foreground">{tipoDe(u)}</p>
                        </div>
                        <SeloDeSaude nivel={saude.nivel} />
                      </div>
                      {saude.motivos.length > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">{saude.motivos.join(" · ")}</p>
                      ) : null}
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt className="text-muted-foreground">Membros</dt>
                        <dd className="text-right tabular-nums">{u.membrosAtivos}</dd>
                        <dt className="text-muted-foreground">Presença nos cultos</dt>
                        <dd className="text-right tabular-nums">{formatarPorcento(u.cultoPresenca8s)}</dd>
                        <dt className="text-muted-foreground">Presença na EBD</dt>
                        <dd className="text-right tabular-nums">{formatarPorcento(u.ebdPresenca8s)}</dd>
                        <dt className="text-muted-foreground">Em alerta de faltas</dt>
                        <dd className="text-right tabular-nums">{u.cultoEmAlerta}</dd>
                        <dt className="text-muted-foreground">Visitas a fazer</dt>
                        <dd className="text-right tabular-nums">{u.visitasSemContato}</dd>
                        <dt className="text-muted-foreground">Dízimos e ofertas do mês</dt>
                        <dd className="text-right tabular-nums">
                          {formatarReais(u.dizimosMesCents + u.ofertasMesCents)}
                        </dd>
                        {u.mensalidade ? (
                          <>
                            <dt className="text-muted-foreground">Mensalidade</dt>
                            <dd className="text-right">{MENSALIDADE[u.mensalidade]}</dd>
                          </>
                        ) : null}
                      </dl>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => verUnidade(u.churchId)}
                      >
                        Ver só esta igreja
                      </Button>
                    </li>
                  );
                })}
              </ul>

              <PaginacaoLocal
                pagina={paginaDaLista.pagina}
                totalPaginas={paginaDaLista.totalPaginas}
                total={paginaDaLista.total}
                onMudar={setPagina}
                rotulo="igreja"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
