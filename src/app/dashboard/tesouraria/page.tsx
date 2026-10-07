import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Gift, HandCoins, Search, Wallet } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PaginationControls } from "@/components/pagination-controls";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClasses } from "@/features/acompanhamento/components/campos";
import { LancamentoDialog } from "@/features/tesouraria/components/lancamento-dialog";
import { LancamentosLista } from "@/features/tesouraria/components/lancamentos-lista";
import { MesNav } from "@/features/tesouraria/components/mes-nav";
import { hojeISO } from "@/lib/acompanhamento";
import { paginaDaUrl, paginar } from "@/lib/paginacao";
import {
  FORMAS,
  FORMA_LABEL,
  TIPOS,
  TIPO_LABEL,
  filtrarLancamentos,
  filtrosParaUrl,
  formatarValor,
  lerFiltros,
  mesDe,
  somar,
} from "@/lib/tesouraria";
import { cn } from "@/lib/utils";
import { getTesourariaActorAutorizado, getTesourariaService } from "@/server/tesouraria";

export const metadata: Metadata = { title: "Tesouraria" };

const BASE = "/dashboard/tesouraria";
/** Lançamentos por página. */
const POR_PAGINA = 25;

/**
 * Lançamentos do mês, com filtro por tipo, forma e nome do dizimista. Os
 * totais do topo acompanham o filtro: filtrar por "Dízimo" + um nome mostra
 * quanto aquela pessoa entregou no mês.
 */
export default async function TesourariaPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tipo?: string; forma?: string; q?: string; page?: string }>;
}) {
  const actor = await getTesourariaActorAutorizado();
  if (!actor) notFound();

  const sp = await searchParams;
  const hoje = hojeISO();
  const filtros = lerFiltros(sp, hoje);
  const service = await getTesourariaService();
  const [{ lancamentos: doMes }, cultos] = await Promise.all([
    service.doMes(actor, filtros.mes),
    service.cultos(actor),
  ]);

  const filtrados = filtrarLancamentos(doMes, filtros);
  const totais = somar(filtrados);
  const pag = paginar(filtrados, paginaDaUrl(sp.page), POR_PAGINA);
  const params = filtrosParaUrl(filtros);
  const comFiltro = filtros.tipo !== "todos" || filtros.forma !== "todas" || filtros.nome !== "";
  const exportar = `${BASE}/exportar?${new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString()}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MesNav mes={filtros.mes} mesAtual={mesDe(hoje)} basePath={BASE} params={params} />
        <LancamentoDialog cultos={cultos} hoje={hoje} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard icon={HandCoins} label="Dízimos" value={formatarValor(totais.dizimos)} />
        <MetricCard icon={Gift} label="Ofertas" value={formatarValor(totais.ofertas)} />
        <MetricCard
          icon={Wallet}
          label={comFiltro ? "Total do filtro" : "Total do mês"}
          value={formatarValor(totais.total)}
          hint={`${totais.quantidade} lançamento${totais.quantidade === 1 ? "" : "s"}`}
        />
      </div>

      {/* Filtros por URL: funcionam sem JS e o link filtrado pode ser guardado. */}
      <form className="flex flex-col gap-2 sm:flex-row sm:items-center" role="search">
        <input type="hidden" name="mes" value={filtros.mes} />
        <select name="tipo" defaultValue={filtros.tipo} className={cn(selectClasses, "sm:w-40")} aria-label="Tipo">
          <option value="todos">Dízimos e ofertas</option>
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              Só {TIPO_LABEL[t].toLowerCase()}s
            </option>
          ))}
        </select>
        <select name="forma" defaultValue={filtros.forma} className={cn(selectClasses, "sm:w-40")} aria-label="Forma">
          <option value="todas">Todas as formas</option>
          {FORMAS.map((f) => (
            <option key={f} value={f}>
              {FORMA_LABEL[f]}
            </option>
          ))}
        </select>
        <div className="relative sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={filtros.nome}
            placeholder="Nome do dizimista"
            aria-label="Nome do dizimista"
            className="h-9 pl-8"
          />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {comFiltro ? (
          <Link href={`${BASE}?mes=${filtros.mes}`} className={buttonVariants({ variant: "ghost" })}>
            Limpar
          </Link>
        ) : null}
      </form>

      {pag.itens.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {doMes.length === 0
            ? "Nenhum lançamento neste mês. Use “Novo lançamento” para registrar os dízimos e a oferta de um culto."
            : "Nenhum lançamento com este filtro."}
        </p>
      ) : (
        <LancamentosLista lancamentos={pag.itens} cultos={cultos} hoje={hoje} />
      )}

      <PaginationControls page={pag.pagina} pageSize={POR_PAGINA} total={pag.total} basePath={BASE} params={params} />

      {filtrados.length > 0 ? (
        <a href={exportar} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 self-start")}>
          <Download className="size-4" /> Baixar planilha (CSV)
        </a>
      ) : null}
    </div>
  );
}
