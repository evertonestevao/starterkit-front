import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoImprimir } from "@/features/ebd/components/botao-imprimir";
import { formatarData, formatarPercentual, hojeISO } from "@/lib/acompanhamento";
import { domingoSugerido, formatarReais, totaisDoDia, trimestreDe } from "@/lib/ebd";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Relatório do domingo — EBD" };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Relatório do domingo em formato de folha (A4), para salvar em PDF ou
 * imprimir pelo navegador. Mesmos números do Resumo; o professor vê só as
 * classes dele (o service e a RLS decidem). Na impressão, o menu e o
 * cabeçalho do painel somem (print:hidden no AppShell e no layout da EBD).
 */
export default async function RelatorioDomingoPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const sp = await searchParams;
  const data = sp.data && DATA.test(sp.data) ? sp.data : domingoSugerido(hojeISO());

  const service = await getEbdService();
  const [{ active }, { classes }, resumo, trimestres] = await Promise.all([
    getActiveTenant(),
    service.classes(actor),
    service.resumoDoDia(actor, data),
    service.trimestres(actor),
  ]);
  const trimestre = trimestreDe(trimestres, data);
  const t = totaisDoDia(resumo);
  const professores = new Map(classes.map((c) => [c.id, c.professores.map((p) => p.nome).join(", ")]));
  const presenca = (presentes: number, ausentes: number) =>
    presentes + ausentes > 0 ? formatarPercentual((presentes / (presentes + ausentes)) * 100) : "—";

  const celula = "border border-neutral-400 px-2 py-1.5";
  const numero = `${celula} text-right tabular-nums`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/ebd?data=${data}`} className="text-sm text-muted-foreground hover:underline">
          ← Voltar ao resumo
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex items-center gap-2 text-sm">
            <input name="data" type="date" defaultValue={data} className="h-9 rounded-md border bg-transparent px-2" aria-label="Domingo" />
            <button type="submit" className="h-9 rounded-md border px-3 hover:bg-muted">
              Ver
            </button>
          </form>
          <BotaoImprimir />
        </div>
      </div>
      <p className="text-xs text-muted-foreground print:hidden">
        Ao clicar em &ldquo;Salvar em PDF&rdquo;, escolha &ldquo;Salvar como PDF&rdquo; no destino da impressão (ou a
        impressora, para sair em papel).
      </p>

      {/* A folha: cores fixas (preto no branco), para sair igual no tema escuro. */}
      <article className="rounded-lg border bg-white p-6 text-sm text-black print:rounded-none print:border-0 print:p-0">
        <header className="mb-4 border-b border-neutral-400 pb-3">
          <p className="text-xs tracking-wide text-neutral-600 uppercase">Escola Bíblica Dominical</p>
          <h3 className="text-xl font-semibold">{active?.name ?? "Igreja"}</h3>
          <p className="mt-1">
            Relatório do domingo <strong>{formatarData(data)}</strong>
            {trimestre ? ` · ${trimestre.nome}${trimestre.revista ? ` (${trimestre.revista})` : ""}` : ""}
          </p>
        </header>

        {resumo.length === 0 ? (
          <p>Nenhuma classe ativa.</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-neutral-100 text-left">
                <th className={celula}>Classe</th>
                <th className={numero}>Matr.</th>
                <th className={numero}>Pres.</th>
                <th className={numero}>Aus.</th>
                <th className={numero}>Just.</th>
                <th className={numero}>Presença</th>
                <th className={numero}>Visit.</th>
                <th className={numero}>Bíblias</th>
                <th className={numero}>Revistas</th>
                <th className={numero}>Oferta</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((r) => (
                <tr key={r.classeId} className="break-inside-avoid align-top">
                  <td className={celula}>
                    <span className="font-medium">{r.classeNome}</span>
                    {professores.get(r.classeId) ? (
                      <span className="block text-xs text-neutral-600">Prof.: {professores.get(r.classeId)}</span>
                    ) : null}
                    {r.licao ? <span className="block text-xs text-neutral-600">Lição: {r.licao}</span> : null}
                  </td>
                  <td className={numero}>{r.matriculados}</td>
                  {r.chamadaFeita ? (
                    <>
                      <td className={numero}>{r.presentes}</td>
                      <td className={numero}>{r.ausentes}</td>
                      <td className={numero}>{r.justificados}</td>
                      <td className={numero}>{presenca(r.presentes, r.ausentes)}</td>
                      <td className={numero}>{r.visitantes}</td>
                      <td className={numero}>{r.biblias}</td>
                      <td className={numero}>{r.revistas}</td>
                      <td className={numero}>{formatarReais(r.ofertaCentavos)}</td>
                    </>
                  ) : (
                    <td className={`${celula} text-center text-neutral-600`} colSpan={8}>
                      chamada não feita
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-neutral-100 font-semibold">
                <td className={celula}>Total</td>
                <td className={numero}>{t.matriculados}</td>
                <td className={numero}>{t.presentes}</td>
                <td className={numero}>{t.ausentes}</td>
                <td className={numero}>{t.justificados}</td>
                <td className={numero}>{presenca(t.presentes, t.ausentes)}</td>
                <td className={numero}>{t.visitantes}</td>
                <td className={numero}>{t.biblias}</td>
                <td className={numero}>{t.revistas}</td>
                <td className={numero}>{formatarReais(t.ofertaCentavos)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <p className="mt-3 text-xs text-neutral-600">
          {t.classesComChamada} de {resumo.length} classe(s) com chamada feita. Presença = presentes ÷ (presentes +
          ausentes); justificados ficam de fora.
        </p>

        <footer className="mt-12 grid grid-cols-2 gap-10 text-xs text-neutral-600">
          <p className="border-t border-neutral-500 pt-1 text-center">Secretaria da EBD</p>
          <p className="border-t border-neutral-500 pt-1 text-center">Superintendente / Pastor</p>
        </footer>
      </article>
    </div>
  );
}
