import { Badge } from "@/components/ui/badge";
import {
  RESULTADO_LABEL,
  formatarData,
  mensagemJustificativaLonga,
  mensagemSaudade,
} from "@/lib/acompanhamento";
import type { AlertaFaltas, JustificativaLonga } from "@/types/acompanhamento";
import { ContatoAcoes } from "./contato-acoes";

function Situacao({ situacao, contatoData, contatoResultado }: {
  situacao: "pendente" | "em_acompanhamento";
  contatoData: string | null;
  contatoResultado: keyof typeof RESULTADO_LABEL | null;
}) {
  if (situacao === "em_acompanhamento") {
    return <Badge variant="secondary">Em acompanhamento desde {formatarData(contatoData)}</Badge>;
  }
  return (
    <Badge variant="destructive">
      Contato pendente
      {contatoData && contatoResultado ? ` · último: ${RESULTADO_LABEL[contatoResultado]} em ${formatarData(contatoData)}` : ""}
    </Badge>
  );
}

export function AlertasLista({ alertas, igreja }: { alertas: AlertaFaltas[]; igreja: string }) {
  if (alertas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Ninguém em alerta. Graças a Deus!
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {alertas.map((a) => (
        <li key={a.membroId} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold">{a.nome}</p>
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{a.faltasSeguidas} faltas seguidas</strong> · última presença:{" "}
                {a.ultimaPresenca ? formatarData(a.ultimaPresenca) : "nenhuma registrada"}
              </p>
            </div>
            <Situacao situacao={a.situacao} contatoData={a.contatoData} contatoResultado={a.contatoResultado} />
          </div>
          <ContatoAcoes
            membroId={a.membroId}
            nome={a.nome}
            telefone={a.whatsapp}
            mensagemPadrao={mensagemSaudade(a.nome, igreja)}
            motivo="faltas"
          />
        </li>
      ))}
    </ul>
  );
}

export function JustificativasLongasLista({ longas, igreja }: { longas: JustificativaLonga[]; igreja: string }) {
  if (longas.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Ninguém justificando há muito tempo.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {longas.map((l) => (
        <li key={l.membroId} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-base font-semibold">{l.nome}</p>
              <p className="text-sm text-muted-foreground">
                Justificando desde {formatarData(l.desde)} ({l.dias} dias
                {l.cultosJustificados > 0 ? `, ${l.cultosJustificados} cultos` : ""}) · última presença:{" "}
                {l.ultimaPresenca ? formatarData(l.ultimaPresenca) : "nenhuma registrada"}
              </p>
            </div>
            <Situacao situacao={l.situacao} contatoData={l.contatoData} contatoResultado={l.contatoResultado} />
          </div>
          <ContatoAcoes
            membroId={l.membroId}
            nome={l.nome}
            telefone={l.whatsapp}
            mensagemPadrao={mensagemJustificativaLonga(l.nome, igreja)}
            motivo="justificativa_longa"
          />
        </li>
      ))}
    </ul>
  );
}
