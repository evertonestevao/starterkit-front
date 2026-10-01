import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/acompanhamento";
import type { ResumoAcompanhamento } from "@/types/acompanhamento";

/** Resumo da chamada no dashboard do pastor. */
export function ResumoAcompanhamentoCard({ resumo }: { resumo: ResumoAcompanhamento }) {
  const itens = [
    { label: "Presentes", valor: resumo.presentes, cor: "text-emerald-700 dark:text-emerald-400" },
    { label: "Justificados", valor: resumo.justificados, cor: "text-amber-700 dark:text-amber-400" },
    { label: "Ausentes", valor: resumo.ausentes, cor: "text-red-700 dark:text-red-400" },
    { label: "Em alerta", valor: resumo.emAlerta, href: "/dashboard/acompanhamento/alertas" },
    { label: "Justificativas longas", valor: resumo.justificativasLongas, href: "/dashboard/acompanhamento/justificativas-longas" },
    { label: "Contatos pendentes", valor: resumo.contatosPendentes, href: "/dashboard/acompanhamento/alertas" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="size-5 text-primary" /> Chamada e acompanhamento
            </CardTitle>
            <CardDescription className="mt-1">
              {resumo.ultimaChamadaData
                ? `Último culto: ${resumo.ultimoCultoNome} em ${formatarData(resumo.ultimaChamadaData)}`
                : "Nenhuma chamada feita ainda."}
            </CardDescription>
          </div>
          <Link
            href="/dashboard/acompanhamento"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Abrir <ArrowRight className="size-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {itens.map((item) => {
          const conteudo = (
            <>
              <p className={`text-2xl font-semibold tabular-nums ${item.cor ?? ""}`}>{item.valor}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </>
          );
          return item.href ? (
            <Link key={item.label} href={item.href} className="rounded-lg border p-3 hover:bg-muted">
              {conteudo}
            </Link>
          ) : (
            <div key={item.label} className="rounded-lg border p-3">
              {conteudo}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
