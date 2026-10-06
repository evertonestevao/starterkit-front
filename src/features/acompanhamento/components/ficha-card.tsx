import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData } from "@/lib/acompanhamento";
import {
  ESTADO_CIVIL_LABEL,
  FORMA_ENTRADA_LABEL,
  SEXO_LABEL,
  SITUACAO_LABEL,
  enderecoEmLinha,
  fichaPreenchida,
} from "@/lib/fichaMembro";
import type { FichaMembro } from "@/types/acompanhamento";
import { FichaForm } from "./ficha-form";

/** Ficha completa do membro, só leitura; mostra apenas o que foi preenchido. */
export function FichaCard({
  membroId,
  nome,
  ficha,
  temLogin,
}: {
  membroId: string;
  nome: string;
  ficha: FichaMembro;
  temLogin: boolean;
}) {
  const itens: Array<[string, string | null]> = [
    ["Sexo", ficha.sexo ? SEXO_LABEL[ficha.sexo] : null],
    ["Estado civil", ficha.estadoCivil ? ESTADO_CIVIL_LABEL[ficha.estadoCivil] : null],
    ["Cônjuge", ficha.conjugeNome],
    ["Casamento", ficha.dataCasamento ? formatarData(ficha.dataCasamento) : null],
    ["Pai", ficha.paiNome],
    ["Mãe", ficha.maeNome],
    ["Filhos", ficha.filhos],
    ["Naturalidade", ficha.naturalidade],
    ["Profissão", ficha.profissao],
    ["Conversão", ficha.dataConversao ? formatarData(ficha.dataConversao) : null],
    ["Membro desde", ficha.membroDesde ? formatarData(ficha.membroDesde) : null],
    ["Entrada", ficha.entradaForma ? FORMA_ENTRADA_LABEL[ficha.entradaForma] : null],
    ["Igreja de origem", ficha.igrejaOrigem],
  ];
  const preenchidos = itens.filter((item): item is [string, string] => item[1] !== null);
  const endereco = enderecoEmLinha(ficha);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Ficha</CardTitle>
          <FichaForm membroId={membroId} nome={nome} ficha={ficha} temLogin={temLogin} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {ficha.situacao !== "ativo" ? (
          <p className="rounded-md bg-amber-500/10 p-2 text-amber-900 dark:text-amber-200">
            <strong>{SITUACAO_LABEL[ficha.situacao]}</strong>
            {ficha.situacaoEm ? ` desde ${formatarData(ficha.situacaoEm)}` : ""}
            {ficha.situacaoMotivo ? ` · ${ficha.situacaoMotivo}` : ""}
          </p>
        ) : null}
        {!fichaPreenchida(ficha) ? (
          <p className="text-muted-foreground">
            Ficha ainda não preenchida. Use &quot;Editar ficha&quot; para informar endereço, família e a vida na igreja.
          </p>
        ) : (
          <>
            {preenchidos.length > 0 ? (
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {preenchidos.map(([rotulo, valor]) => (
                  <div key={rotulo} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{rotulo}</dt>
                    <dd className="break-words font-medium">{valor}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {endereco ? (
              <div>
                <p className="text-xs text-muted-foreground">Endereço</p>
                <p className="font-medium">{endereco}</p>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
