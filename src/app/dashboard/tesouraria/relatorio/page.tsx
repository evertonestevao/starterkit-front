import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { BotaoImprimir } from "@/features/tesouraria/components/botao-imprimir";
import { MesNav } from "@/features/tesouraria/components/mes-nav";
import { formatarData, hojeISO } from "@/lib/acompanhamento";
import {
  FORMA_LABEL,
  agruparPorCulto,
  agruparPorDizimista,
  formatarValor,
  lerFiltros,
  mesDe,
  nomeDoMes,
  somar,
  somarPorForma,
} from "@/lib/tesouraria";
import { cn } from "@/lib/utils";
import { getTesourariaActorAutorizado, getTesourariaService } from "@/server/tesouraria";

export const metadata: Metadata = { title: "Relatório mensal da tesouraria" };

const BASE = "/dashboard/tesouraria/relatorio";
const celula = "px-3 py-2";
const numero = `${celula} text-right tabular-nums`;

/**
 * Fechamento do mês: total de dízimos e ofertas, por forma de recebimento,
 * culto a culto, e a relação de dizimistas. Feito para imprimir e levar à
 * reunião — os botões e o menu somem na impressão.
 */
export default async function TesourariaRelatorioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const actor = await getTesourariaActorAutorizado();
  if (!actor) notFound();

  const hoje = hojeISO();
  const { mes } = lerFiltros(await searchParams, hoje);
  const { igreja, lancamentos } = await (await getTesourariaService()).doMes(actor, mes);

  const totais = somar(lancamentos);
  const porForma = somarPorForma(lancamentos);
  const porCulto = agruparPorCulto(lancamentos);
  const dizimistas = agruparPorDizimista(lancamentos);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <MesNav mes={mes} mesAtual={mesDe(hoje)} basePath={BASE} />
        <div className="flex flex-wrap gap-2">
          <BotaoImprimir />
          <a
            href={`/dashboard/tesouraria/exportar?mes=${mes}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <Download className="size-4" /> Planilha (CSV)
          </a>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold">
          Dízimos e ofertas — <span className="first-letter:uppercase">{nomeDoMes(mes)}</span>
        </h3>
        <p className="text-sm text-muted-foreground">
          {igreja.name} · emitido em {formatarData(hoje)} · não inclui a oferta da EBD
        </p>
      </div>

      {lancamentos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum lançamento neste mês.
        </p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Totais do mês">
            {(
              [
                ["Dízimos", totais.dizimos],
                ["Ofertas", totais.ofertas],
                ["Total", totais.total],
              ] as const
            ).map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">{rotulo}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{formatarValor(valor)}</p>
              </div>
            ))}
          </section>

          <p className="text-sm text-muted-foreground">
            Como foi recebido: {porForma.map((f) => `${FORMA_LABEL[f.forma]} ${formatarValor(f.total)}`).join(" · ")}
          </p>

          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Por culto</h4>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className={celula}>Data</th>
                    <th className={celula}>Culto</th>
                    <th className={numero}>Dízimos</th>
                    <th className={numero}>Ofertas</th>
                    <th className={numero}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {porCulto.map((l) => (
                    <tr key={`${l.data}|${l.culto ?? ""}`}>
                      <td className={cn(celula, "whitespace-nowrap")}>{formatarData(l.data)}</td>
                      <td className={celula}>
                        {l.culto ?? <span className="text-muted-foreground">Sem culto definido</span>}
                      </td>
                      <td className={numero}>{formatarValor(l.dizimos)}</td>
                      <td className={numero}>{formatarValor(l.ofertas)}</td>
                      <td className={cn(numero, "font-medium")}>{formatarValor(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-medium">
                  <tr>
                    <td className={celula} colSpan={2}>
                      Total do mês
                    </td>
                    <td className={numero}>{formatarValor(totais.dizimos)}</td>
                    <td className={numero}>{formatarValor(totais.ofertas)}</td>
                    <td className={numero}>{formatarValor(totais.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {dizimistas.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">Dizimistas do mês ({dizimistas.length})</h4>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className={celula}>Nome</th>
                      <th className={numero}>Lançamentos</th>
                      <th className={numero}>Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dizimistas.map((d) => (
                      <tr key={d.chave}>
                        <td className={celula}>{d.nome}</td>
                        <td className={numero}>{d.quantidade}</td>
                        <td className={cn(numero, "font-medium")}>{formatarValor(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
