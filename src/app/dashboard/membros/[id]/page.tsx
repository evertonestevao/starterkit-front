import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BotaoVoltar } from "@/components/botao-voltar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AcessoBadge, AcessoMembroCard } from "@/features/acompanhamento/components/acesso-membro";
import { DocumentosCard } from "@/features/acompanhamento/components/documentos-card";
import { ExcluirMembro } from "@/features/acompanhamento/components/excluir-membro";
import { FichaCard } from "@/features/acompanhamento/components/ficha-card";
import { HistoricoCard } from "@/features/acompanhamento/components/historico-card";
import { MembroForm } from "@/features/acompanhamento/components/membro-form";
import { ResponsaveisBotao } from "@/features/ebd/components/ebd-responsaveis";
import { isAppError } from "@/lib/errors";
import {
  contarFaltasSeguidas,
  formatarData,
  formatarPercentual,
  hojeISO,
  percentualPresenca,
  ESTADO_LABEL,
  MOTIVO_LABEL,
  RESULTADO_LABEL,
} from "@/lib/acompanhamento";
import { camposFaltando } from "@/lib/documentosMembro";
import { idadeEm } from "@/lib/ebd";
import { SITUACAO_LABEL } from "@/lib/fichaMembro";
import { mascaraTelefone } from "@/lib/telefone";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { getEbdService } from "@/server/ebd";
import { getSecretariaActorAutorizado, getSecretariaService } from "@/server/secretaria";
import { canEditarModelos } from "@/services/secretariaService";
import type { EstadoPresenca } from "@/types/acompanhamento";

export const metadata: Metadata = { title: "Membro" };

const COR: Record<EstadoPresenca, string> = {
  presente: "text-emerald-700 dark:text-emerald-400",
  ausente: "text-red-700 dark:text-red-400",
  justificado: "text-amber-700 dark:text-amber-400",
};

export default async function MembroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ficha?: string }>;
}) {
  const { id } = await params;
  // Vindo de "Salvar e preencher a ficha" no cadastro novo.
  const abrirFicha = (await searchParams).ficha === "1";
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();

  const service = await getAcompanhamentoService();
  const ebdService = await getEbdService();
  const [dados, ficha, cargos, acessos, ebd, responsaveis] = await Promise.all([
    service.getMembro(actor, id).catch((err: unknown) => {
      if (isAppError(err) && (err.code === "not_found" || err.code === "validation_error")) return null;
      throw err;
    }),
    // Membro que não existe cai no notFound() abaixo, pelos dados principais.
    service.getFicha(actor, id).catch((err: unknown) => {
      if (isAppError(err) && (err.code === "not_found" || err.code === "validation_error")) return null;
      throw err;
    }),
    service.cargosDisponiveis(actor),
    service.acessos(actor),
    // A EBD é um complemento da ficha: se falhar, a ficha segue sem ela.
    ebdService.resumoDoMembro(id).catch((err: unknown) => {
      console.error("[membro] falha ao carregar a EBD", err);
      return null;
    }),
    ebdService
      .responsaveis([id])
      .then((r) => r[id] ?? [])
      .catch((err: unknown) => {
        console.error("[membro] falha ao carregar os responsáveis", err);
        return [];
      }),
  ]);
  if (!dados || !ficha) notFound();

  // Histórico e documentos são do módulo Membros: quem só faz a chamada não os vê.
  // Complementos da ficha — se falharem, ela segue sem eles.
  const secretario = await getSecretariaActorAutorizado();
  const secretaria = secretario
    ? await (async () => {
        const svc = await getSecretariaService();
        const [itens, emissao] = await Promise.all([svc.historico(secretario, id), svc.paraEmitir(secretario)]);
        return { itens, emissao };
      })().catch((err: unknown) => {
        console.error("[membro] falha ao carregar histórico e documentos", err);
        return null;
      })
    : null;
  const gerenciaAcesso = actor.role === "owner" || actor.role === "admin";
  const { membro, historico, justificativas, contatos } = dados;
  const acesso = membro.userId ? acessos.porUsuario[membro.userId] : undefined;
  const convite = membro.email ? acessos.convitePorEmail[membro.email.toLowerCase()] : undefined;

  const presentes = historico.filter((h) => h.estado === "presente").length;
  const ausentes = historico.filter((h) => h.estado === "ausente").length;
  const justificados = historico.length - presentes - ausentes;
  const percentual = percentualPresenca(presentes, ausentes);
  // Histórico vem do mais recente para o mais antigo; a regra lê em ordem cronológica.
  const sequencia = contarFaltasSeguidas([...historico].reverse().map((h) => h.estado));

  return (
    <div className="flex flex-col gap-4">
      <BotaoVoltar href="/dashboard/membros" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{membro.nome}</h3>
          <p className="text-sm text-muted-foreground">
            {mascaraTelefone(membro.whatsapp) || "Sem telefone"}
            {membro.email ? ` · ${membro.email}` : ""}
            {membro.nascimento ? ` · nascimento ${formatarData(membro.nascimento)}` : ""}
            {membro.batismo ? ` · batismo ${formatarData(membro.batismo)}` : ""}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {membro.cargos.map((c) => (
              <Badge key={c.id} variant="secondary">
                {c.nome}
              </Badge>
            ))}
            <AcessoBadge acesso={acesso} convite={convite} />
            {!membro.ativo ? (
              <Badge variant="outline">{ficha.situacao !== "ativo" ? SITUACAO_LABEL[ficha.situacao] : "Inativo"}</Badge>
            ) : null}
            {membro.ativo && !membro.participaChamada ? <Badge variant="outline">Fora da chamada</Badge> : null}
            {!membro.membroIgreja ? <Badge variant="outline">Não membro</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Quem tem login não é excluído por aqui: primeiro remove-se o acesso. */}
          {!membro.userId ? <ExcluirMembro membroId={membro.id} nome={membro.nome} /> : null}
          <MembroForm membro={membro} cargos={cargos} podeConvidar={gerenciaAcesso && !acesso && !convite} />
        </div>
      </div>
      {membro.observacoes ? <p className="rounded-lg bg-muted/50 p-3 text-sm">{membro.observacoes}</p> : null}

      <FichaCard
        membroId={membro.id}
        nome={membro.nome}
        ficha={ficha}
        temLogin={Boolean(membro.userId)}
        abrirFormulario={abrirFicha}
      />

      {secretaria ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <HistoricoCard membroId={membro.id} nome={membro.nome} itens={secretaria.itens} hoje={hojeISO()} />
          <DocumentosCard
            membroId={membro.id}
            nome={membro.nome}
            temPastor={Boolean(secretaria.emissao.igreja.pastor)}
            podeEditarModelos={canEditarModelos(actor.role)}
            documentos={secretaria.emissao.modelos.map((m) => ({
              tipo: m.tipo,
              // Sem destino: se o modelo usa {destino}, o aviso some quando a pessoa digitar.
              faltando: camposFaltando(`${m.titulo}\n${m.corpo}`, {
                membro: {
                  nome: membro.nome,
                  sexo: ficha.sexo,
                  nascimento: membro.nascimento,
                  estadoCivil: ficha.estadoCivil,
                  batismo: membro.batismo,
                  membroDesde: ficha.membroDesde,
                  cargos: membro.cargos.map((c) => c.nome),
                },
                // O Pastor que falta tem aviso próprio, com o que fazer.
                igreja: { ...secretaria.emissao.igreja, pastor: secretaria.emissao.igreja.pastor ?? "-" },
                destino: null,
                hoje: hojeISO(),
              }),
            }))}
          />
        </div>
      ) : null}

      {gerenciaAcesso ? <AcessoMembroCard membro={membro} acesso={acesso} convite={convite} /> : null}

      {/* Responsáveis e cuidados: para crianças e quem não é do quadro, ou se já há algo anotado. */}
      {!membro.membroIgreja ||
      responsaveis.length > 0 ||
      membro.cuidados ||
      (idadeEm(membro.nascimento, hojeISO()) ?? 99) < 18 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Responsáveis e cuidados</CardTitle>
              <ResponsaveisBotao
                membro={{ id: membro.id, nome: membro.nome }}
                responsaveis={responsaveis}
                cuidados={membro.cuidados}
                podeEscolherMembro={false}
                rotulo="Editar"
              />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {membro.cuidados ? (
              <p className="rounded-md bg-red-500/10 p-2 text-red-800 dark:text-red-300">Cuidados: {membro.cuidados}</p>
            ) : null}
            {responsaveis.length === 0 ? (
              <p className="text-muted-foreground">Nenhum responsável cadastrado.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {responsaveis.map((r) => (
                  <li key={r.id}>
                    <strong>{r.nome}</strong> · {r.parentesco}
                    {r.telefone ? ` · ${r.telefone}` : ""}
                    {r.podeBuscar ? "" : " · não pode buscar"}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {ebd ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Escola Bíblica</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Classe</p>
              <p className="font-medium">
                {ebd.classeAtual ? `${ebd.classeAtual} (desde ${formatarData(ebd.desde)})` : "Sem classe no momento"}
              </p>
              {ebd.classesAnteriores ? (
                <p className="text-xs text-muted-foreground">Antes: {ebd.classesAnteriores}</p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Presença</p>
              <p className="font-medium tabular-nums">
                {formatarPercentual(percentualPresenca(ebd.presencas, ebd.ausencias))}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {ebd.presencas} presentes · {ebd.ausencias} ausentes · {ebd.justificados} justificados
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Última presença</p>
              <p className="font-medium">{formatarData(ebd.ultimaPresenca)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero label="Presença" valor={formatarPercentual(percentual)} dica="sem contar justificados" />
        <Numero label="Presentes" valor={presentes} />
        <Numero label="Justificados" valor={justificados} />
        <Numero label="Faltas seguidas" valor={sequencia} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos cultos</CardTitle>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda sem chamadas.</p>
          ) : (
            <ul className="flex flex-col divide-y text-sm">
              {historico.slice(0, 30).map((h, i) => (
                <li key={`${h.data}-${i}`} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {formatarData(h.data)} · {h.cultoNome}
                  </span>
                  <span className={COR[h.estado]}>{ESTADO_LABEL[h.estado]}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Justificativas</CardTitle>
          </CardHeader>
          <CardContent>
            {justificativas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {justificativas.map((j) => (
                  <li key={j.id}>
                    {formatarData(j.dataInicio)}
                    {j.dataFim !== j.dataInicio ? ` a ${formatarData(j.dataFim)}` : ""} — {MOTIVO_LABEL[j.motivo]}
                    {j.motivoTexto ? `: ${j.motivoTexto}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contatos do pastor</CardTitle>
          </CardHeader>
          <CardContent>
            {contatos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato registrado.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {contatos.map((c) => (
                  <li key={c.id}>
                    {formatarData(c.data)} — {RESULTADO_LABEL[c.resultado]}
                    {c.observacao ? <span className="block text-muted-foreground">{c.observacao}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Numero({ label, valor, dica }: { label: string; valor: string | number; dica?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {dica ? <p className="text-[0.7rem] text-muted-foreground">{dica}</p> : null}
    </div>
  );
}
