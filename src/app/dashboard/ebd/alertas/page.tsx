import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSaudacaoAtiva } from "@/server/saudacao";
import { Badge } from "@/components/ui/badge";
import { ContatoAcoes } from "@/features/acompanhamento/components/contato-acoes";
import { RESULTADO_LABEL, formatarData, hojeISO } from "@/lib/acompanhamento";
import { idadeEm, mensagemSaudadeEbd } from "@/lib/ebd";
import { registrarContatoEbdAction } from "@/server/actions/ebd";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";

export const metadata: Metadata = { title: "Alertas da EBD" };

/** Até esta idade a mensagem de WhatsApp fala com a família. */
const IDADE_CRIANCA = 14;

export default async function EbdAlertasPage() {
  const actor = await getEbdActorAutorizado();
  if (!actor) notFound();
  const { igreja, alertas } = await (await getEbdService()).alertas(actor);
  const saudacao = await getSaudacaoAtiva();
  const hoje = hojeISO();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Alunos com faltas seguidas na classe em que estão matriculados. É separado do alerta dos cultos: aqui conta só a
        EBD.
      </p>
      {alertas.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum aluno em alerta. Graças a Deus!
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alertas.map((a) => {
            const idade = idadeEm(a.nascimento, hoje);
            const crianca = idade !== null && idade <= IDADE_CRIANCA;
            return (
              <li key={`${a.membroId}-${a.classeId}`} className="flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">
                      {a.nome}
                      {idade !== null ? <span className="font-normal text-muted-foreground"> · {idade} anos</span> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">{a.faltasSeguidas} faltas seguidas</strong> em {a.classeNome} ·
                      última presença: {a.ultimaPresenca ? formatarData(a.ultimaPresenca) : "nenhuma registrada"}
                    </p>
                    {a.responsavelNome && (crianca || !a.whatsapp) ? (
                      <p className="text-sm text-muted-foreground">
                        Responsável: {a.responsavelNome}
                        {a.responsavelTelefone ? ` · ${a.responsavelTelefone}` : ""}
                      </p>
                    ) : null}
                  </div>
                  {a.situacao === "em_acompanhamento" ? (
                    <Badge variant="secondary">Em acompanhamento desde {formatarData(a.contatoData)}</Badge>
                  ) : (
                    <Badge variant="destructive">
                      Contato pendente
                      {a.contatoData && a.contatoResultado
                        ? ` · último: ${RESULTADO_LABEL[a.contatoResultado]} em ${formatarData(a.contatoData)}`
                        : ""}
                    </Badge>
                  )}
                </div>
                <ContatoAcoes
                  membroId={a.membroId}
                  nome={a.nome}
                  // Criança (ou quem não tem WhatsApp): fala com o responsável.
                  telefone={crianca || !a.whatsapp ? (a.responsavelTelefone ?? a.whatsapp) : a.whatsapp}
                  mensagemPadrao={mensagemSaudadeEbd(a.nome, a.classeNome, igreja.name, crianca, saudacao)}
                  motivo="faltas"
                  registrar={registrarContatoEbdAction}
                  extras={{ classeId: a.classeId }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
