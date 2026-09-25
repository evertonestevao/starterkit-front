"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Building2, Check, ChevronDown, Church, Copy, House, Link2, MessageCircle, Network, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useToastedAction } from "@/hooks/useToastedAction";
import { pastorLabel } from "@/lib/churchLeaders";
import { formatChurchName } from "@/lib/churchName";
import {
  CHURCH_LINK_MAX_USES_LIMIT,
  CHURCH_LINK_VALIDITY_OPTIONS,
  LINK_TIPO_LABEL,
  LINK_TIPO_PLURAL,
  TIPO_LABEL,
  describeValidity,
  type ChurchLinkValidity,
} from "@/lib/churchLinks";
import { cn } from "@/lib/utils";
import type { NetworkEntry } from "@/lib/churchNetwork";
import {
  cancelChurchLinkRequestAction,
  createChurchLinkInviteAction,
  decideChurchLinkRequestAction,
  revokeChurchLinkInviteAction,
} from "@/server/actions/churchLinks";
import type { ChurchTipo } from "@/types/database";
import { EndLinkButton, selectClasses } from "./church-link-controls";
import { ChurchNetworkList } from "./church-network-list";
import type {
  ChurchLinkChurch,
  ChurchLinkInvite,
  ChurchLinkInviteStatus,
  ChurchLinkNode,
  ChurchLinkRequest,
  ChurchLinkRequestStatus,
  ChurchLinkTipo,
} from "@/types/churchLinks";

const INVITE_STATUS_LABEL: Record<ChurchLinkInviteStatus, string> = {
  ativo: "Ativo",
  revogado: "Cancelado",
  expirado: "Expirou",
  esgotado: "Esgotado",
};

const REQUEST_STATUS_LABEL: Record<ChurchLinkRequestStatus, string> = {
  pendente: "Aguardando resposta",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
  encerrado: "Vínculo desfeito",
};

const REQUEST_STATUS_VARIANT: Record<ChurchLinkRequestStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pendente: "secondary",
  aprovado: "default",
  recusado: "destructive",
  cancelado: "outline",
  encerrado: "outline",
};

const TIPO_ICON: Record<ChurchTipo, typeof Church> = {
  sede: Church,
  subsede: Building2,
  congregacao: House,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

const inputClasses =
  "h-9 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Pedido que a igreja-mãe precisa decidir. Aprovar liga a igreja à rede (na
 * função escolhida aqui, que pode ser diferente da pedida); recusar não liga
 * nada, e o motivo é opcional.
 */
function PendingRequestCard({ request, tipos }: { request: ChurchLinkRequest; tipos: ChurchLinkTipo[] }) {
  // O cartão some quando o pedido é decidido: o aviso não pode depender dele.
  const [formAction, pending] = useToastedAction(decideChurchLinkRequestAction);
  const [recusando, setRecusando] = useState(false);

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {request.childName}
          <Badge variant="secondary">Pede para ser {LINK_TIPO_LABEL[request.tipoSolicitado].toLowerCase()}</Badge>
        </p>
        {request.childAddress ? <p className="text-xs text-muted-foreground">{request.childAddress}</p> : null}
        <p className="text-xs text-muted-foreground">
          {request.solicitanteNome ? `Pedido de ${request.solicitanteNome} · ` : ""}
          {formatDate(request.requestedAt)}
        </p>
        {request.childPublicCode ? (
          <a
            href={`/igreja/${request.childPublicCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-xs text-primary underline-offset-4 hover:underline"
          >
            Ver a página desta igreja
          </a>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="requestId" value={request.id} />
        {recusando ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`motivo-${request.id}`}>Motivo (opcional)</Label>
            <input
              id={`motivo-${request.id}`}
              name="motivo"
              maxLength={500}
              placeholder="Quem pediu vai ler isto."
              className={cn(inputClasses, "w-full")}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor={`tipo-${request.id}`}>
              Aprovar como
            </label>
            <select id={`tipo-${request.id}`} name="tipo" defaultValue={request.tipoSolicitado} className={selectClasses}>
              {tipos.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {LINK_TIPO_LABEL[tipo]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {recusando ? (
            <>
              <Button type="submit" name="decisao" value="recusar" variant="destructive" size="sm" disabled={pending} className="gap-1.5">
                <X className="size-4" aria-hidden />
                Confirmar recusa
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRecusando(false)} disabled={pending}>
                Voltar
              </Button>
            </>
          ) : (
            <>
              <Button type="submit" name="decisao" value="aprovar" size="sm" disabled={pending} className="gap-1.5">
                <Check className="size-4" aria-hidden />
                {pending ? "Enviando..." : "Aprovar"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setRecusando(true)} disabled={pending}>
                Recusar
              </Button>
            </>
          )}
        </div>
      </form>
    </li>
  );
}

/** O link recém-gerado: copiar e mandar pelo WhatsApp, que é por onde os pastores conversam. */
function GeneratedLink({ url, intro }: { url: string; intro: string }) {
  const { copied, copy } = useCopyToClipboard(2500);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${intro} ${url}`)}`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-medium">Link pronto</p>
      <p className="text-xs text-muted-foreground">
        Guarde este link agora: por segurança ele não é mostrado de novo (se perder, cancele e gere outro). Ele
        não liga ninguém sozinho: cada pastor que abrir gera um pedido, e você aprova ou recusa.
      </p>
      <p className="rounded-md bg-background px-2.5 py-2 text-xs break-all select-all">{url}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => copy(url)} className="gap-1.5">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copiado" : "Copiar link"}
        </Button>
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
        >
          <MessageCircle className="size-4" aria-hidden />
          Enviar pelo WhatsApp
        </a>
      </div>
    </div>
  );
}

function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const [formAction, pending] = useToastedAction(revokeChurchLinkInviteAction);
  return (
    <form action={formAction}>
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending} className="gap-1 text-muted-foreground">
        <X className="size-3.5" aria-hidden />
        Cancelar link
      </Button>
    </form>
  );
}

/** Um passo do formulário: número, pergunta e as opções logo abaixo. */
function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex items-center gap-2 text-sm font-medium">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
          aria-hidden
        >
          {number}
        </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

const chipClasses =
  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50";

function inviteSummary(invite: ChurchLinkInvite): string {
  const validade =
    invite.expiresAt === null
      ? "sem validade"
      : invite.status === "expirado"
        ? `expirou em ${formatDate(invite.expiresAt)}`
        : `vale até ${formatDate(invite.expiresAt)}`;
  const pedidos =
    invite.maxUses === null
      ? `${invite.uses} ${invite.uses === 1 ? "pedido" : "pedidos"} (sem limite)`
      : `${invite.uses} de ${invite.maxUses} pedidos`;
  return `${pedidos} · ${validade} · gerado em ${formatDate(invite.createdAt)}`;
}

function CreateInviteCard({
  church,
  options,
  invites,
}: {
  church: ChurchLinkChurch;
  options: ChurchLinkTipo[];
  invites: ChurchLinkInvite[];
}) {
  const [state, formAction, pending] = useActionState(createChurchLinkInviteAction, undefined);
  useActionToast(state);
  const [tipo, setTipo] = useState<ChurchLinkTipo>(options[0]);
  // Sem padrão: a igreja escolhe. "sem" = sem validade / sem limite.
  const [validade, setValidade] = useState<"sem" | "7" | "15" | "30" | null>(null);
  const [limite, setLimite] = useState<"limitar" | "sem" | null>(null);
  const [usos, setUsos] = useState("");
  // Fechado por padrão: com muitas subsedes, o formulário de 3 passos não precisa ocupar a
  // tela toda vez que a pessoa só quer olhar a rede ou os links já gerados.
  const [aberto, setAberto] = useState(false);
  const nome = formatChurchName(church.name, church.sobrenome);

  const pronto = validade !== null && (limite === "sem" || (limite === "limitar" && Number(usos) >= 1));
  const linkAberto = validade === "sem" || limite === "sem";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Convidar igrejas para a sua rede</CardTitle>
        <CardDescription>
          Gere um link e mande aos pastores das igrejas que você quer convidar. Quem abrir o link pede o vínculo, e
          você aprova cada pedido.
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={aberto}
            aria-controls="gerar-link-form"
            onClick={() => setAberto((v) => !v)}
            className="gap-1.5"
          >
            {aberto ? "Fechar" : "Convidar igreja"}
            <ChevronDown className={cn("size-4 transition-transform", aberto && "rotate-180")} aria-hidden />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {aberto ? (
          <form id="gerar-link-form" action={formAction} className="flex flex-col gap-5">
            <input type="hidden" name="churchId" value={church.id} />
            <input type="hidden" name="tipo" value={tipo} />
            <input type="hidden" name="validade" value={validade ?? ""} />
            <input type="hidden" name="limite" value={limite ?? ""} />

            <Step number={1} title="Como as igrejas convidadas vão participar?">
              <div className="flex flex-wrap gap-2">
                {options.map((opcao) => (
                  <label key={opcao} className={chipClasses}>
                    <input
                      type="radio"
                      name="funcao-link"
                      checked={tipo === opcao}
                      onChange={() => setTipo(opcao)}
                      className="sr-only"
                    />
                    {LINK_TIPO_LABEL[opcao]}
                  </label>
                ))}
              </div>
            </Step>

            <Step number={2} title="Por quanto tempo o link vale?">
              <div className="flex flex-wrap gap-2">
                {CHURCH_LINK_VALIDITY_OPTIONS.map((dias: ChurchLinkValidity) => {
                  const valor = dias === null ? "sem" : (String(dias) as "7" | "15" | "30");
                  return (
                    <label key={valor} className={chipClasses}>
                      <input
                        type="radio"
                        name="validade-escolha"
                        checked={validade === valor}
                        onChange={() => setValidade(valor)}
                        className="sr-only"
                      />
                      {describeValidity(dias)}
                    </label>
                  );
                })}
              </div>
            </Step>

            <Step number={3} title="Quantos pedidos o link aceita?">
              <div className="flex flex-wrap items-center gap-2">
                <label className={chipClasses}>
                  <input
                    type="radio"
                    name="limite-escolha"
                    checked={limite === "limitar"}
                    onChange={() => setLimite("limitar")}
                    className="sr-only"
                  />
                  Até
                  <input
                    name={limite === "limitar" ? "maxUses" : undefined}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={CHURCH_LINK_MAX_USES_LIMIT}
                    value={usos}
                    onChange={(e) => {
                      setUsos(e.target.value);
                      setLimite("limitar");
                    }}
                    aria-label="Número máximo de pedidos"
                    placeholder="10"
                    className={cn(inputClasses, "w-20")}
                  />
                  pedidos
                </label>
                <label className={chipClasses}>
                  <input
                    type="radio"
                    name="limite-escolha"
                    checked={limite === "sem"}
                    onChange={() => setLimite("sem")}
                    className="sr-only"
                  />
                  Sem limite
                </label>
              </div>
            </Step>

            {linkAberto ? (
              <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                Um link {validade === "sem" ? "sem validade" : ""}
                {validade === "sem" && limite === "sem" ? " e " : ""}
                {limite === "sem" ? "sem limite de pedidos" : ""} continua aberto até você cancelá-lo. Ninguém entra
                na rede sem a sua aprovação, mas vale cancelar o link quando não precisar mais dele.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={pending || !pronto} className="gap-1.5">
                <Link2 className="size-4" aria-hidden />
                {pending ? "Gerando..." : "Gerar link"}
              </Button>
              {!pronto ? (
                <span className="text-xs text-muted-foreground">Escolha a validade e o número de pedidos.</span>
              ) : null}
            </div>
          </form>
        ) : null}

        {state?.url ? (
          <GeneratedLink
            url={state.url}
            intro={`${nome} convida a sua igreja para fazer parte da mesma rede. Abra o link, leia como funciona e, se quiser, peça o vínculo:`}
          />
        ) : null}

        {invites.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Links gerados</p>
            <ul className="flex flex-col divide-y rounded-lg border">
              {invites.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={invite.status === "ativo" ? "default" : "outline"}>
                        {INVITE_STATUS_LABEL[invite.status]}
                      </Badge>
                      <span>Para {LINK_TIPO_PLURAL[invite.tipoSubordinada].toLowerCase()}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{inviteSummary(invite)}</span>
                  </span>
                  {invite.status === "ativo" ? <RevokeInviteButton inviteId={invite.id} /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CancelRequestButton({ requestId }: { requestId: string }) {
  const [formAction, pending] = useToastedAction(cancelChurchLinkRequestAction);
  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Cancelar pedido
      </Button>
    </form>
  );
}

function describeRequest(request: ChurchLinkRequest, churchId: string): string {
  const funcao = LINK_TIPO_LABEL[request.tipoFinal ?? request.tipoSolicitado].toLowerCase();
  return request.childChurchId === churchId
    ? `Pedido para ser ${funcao} de ${request.parentName}`
    : `${request.childName} pediu para ser ${funcao}`;
}

/** Uma igreja no desenho da rede: ícone, nome e função. Todas têm o mesmo peso; só "esta igreja" ganha cor. */
function NetworkNode({
  church,
  label,
  current = false,
  pastor,
  children,
}: {
  church: ChurchLinkNode;
  /** Legenda pequena acima do nome: "Igreja-mãe", "Esta igreja". */
  label?: string;
  current?: boolean;
  /** "Pastor: João", quando a igreja tem Pastor registrado e quem olha pode ver. */
  pastor?: string | null;
  children?: React.ReactNode;
}) {
  const Icon = TIPO_ICON[church.tipo];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3",
        current && "border-primary bg-primary/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted",
            current && "bg-primary text-primary-foreground",
          )}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          {label ? <p className="text-xs text-muted-foreground">{label}</p> : null}
          <p className="text-sm font-medium break-words">{formatChurchName(church.name, church.sobrenome)}</p>
          {pastor ? <p className="text-xs text-muted-foreground">{pastor}</p> : null}
          <Badge variant="outline" className="mt-1">
            {TIPO_LABEL[church.tipo]}
          </Badge>
        </div>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** As três etapas do vínculo, em uma linha: o que mais gerava dúvida na aba. */
function HowItWorks() {
  const passos = [
    "A igreja-mãe gera um link e manda ao pastor da outra igreja.",
    "O pastor abre o link e pede o vínculo. Se não quiser, é só fechar.",
    "A igreja-mãe aprova o pedido e as duas passam a fazer parte da mesma rede.",
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-3" aria-label="Como funciona o vínculo entre igrejas">
      {passos.map((passo, i) => (
        <li key={passo} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="text-xs leading-5 text-muted-foreground">{passo}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Vínculo da igreja com a rede do ministério: como funciona, os pedidos que a
 * igreja-mãe precisa decidir, o desenho da rede (com quem está ligada), os
 * links que ela gerou e o histórico.
 */
export function ChurchLinksManager({
  church,
  churches,
  parent,
  entries,
  pastores,
  invites,
  incomingPending,
  myPending,
  history,
  canInvite,
}: {
  church: ChurchLinkChurch;
  churches: ChurchLinkChurch[];
  parent: ChurchLinkNode | null;
  entries: NetworkEntry[];
  /** Nome do Pastor por id de igreja (cargos registrados), para a igreja superior reconhecer quem cuida de cada uma. */
  pastores: Record<string, string>;
  invites: ChurchLinkInvite[];
  incomingPending: ChurchLinkRequest[];
  myPending: ChurchLinkRequest | null;
  history: ChurchLinkRequest[];
  canInvite: ChurchLinkTipo[];
}) {
  const semLigacao = !parent && entries.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {churches.length > 1 && churches.length <= 6 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Igreja">
          {churches.map((c) => (
            <Link
              key={c.id}
              href={`?igreja=${c.id}`}
              aria-current={c.id === church.id ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                c.id === church.id ? "border-primary bg-primary/10" : "hover:bg-muted",
              )}
            >
              {formatChurchName(c.name, c.sobrenome)}
            </Link>
          ))}
        </nav>
      ) : null}

      {/* Muitas igrejas na conta: uma lista de botões ocuparia a tela; aqui é um seletor (GET, sem JS). */}
      {churches.length > 6 ? (
        <form method="get" className="flex flex-wrap items-center gap-2">
          <label htmlFor="igreja-escolhida" className="text-sm font-medium">
            Igreja
          </label>
          <select id="igreja-escolhida" name="igreja" defaultValue={church.id} className={cn(selectClasses, "max-w-full")}>
            {churches.map((c) => (
              <option key={c.id} value={c.id}>
                {formatChurchName(c.name, c.sobrenome)}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Ver
          </Button>
        </form>
      ) : null}

      <HowItWorks />

      {incomingPending.length > 0 ? (
        <Card id="pedidos">
          <CardHeader>
            <CardTitle className="text-base">Pedidos aguardando a sua resposta ({incomingPending.length})</CardTitle>
            <CardDescription>
              Estas igrejas abriram o seu link e pediram para entrar. Nada muda até você aprovar — e, ao aprovar,
              dá para ajustar a função.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {incomingPending.map((request) => (
                <PendingRequestCard key={request.id} request={request} tipos={canInvite} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="size-4 text-primary" aria-hidden />
            Sua rede de igrejas
          </CardTitle>
          <CardDescription>Com quem esta igreja está ligada hoje.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {parent ? (
            <NetworkNode church={parent} label="Igreja-mãe">
              <EndLinkButton churchId={church.id} label="Sair do vínculo" />
            </NetworkNode>
          ) : null}

          <div className={cn(parent && "ml-4 border-l-2 pl-4 sm:ml-6 sm:pl-6")}>
            <NetworkNode church={church} label="Esta igreja" current pastor={pastorLabel(pastores[church.id])} />
          </div>

          <ChurchNetworkList church={church} entries={entries} pastores={pastores} />

          {semLigacao ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Esta igreja ainda não está ligada a nenhuma outra.{" "}
              {myPending
                ? "Ela passa a fazer parte da rede quando o pedido abaixo for aprovado."
                : "Para entrar em uma rede, peça o link ao pastor da igreja-mãe."}
              {canInvite.length > 0 ? " Para convidar outras igrejas, gere um link mais abaixo nesta página." : ""}
            </p>
          ) : null}

          {myPending ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
              <div className="text-sm">
                <p className="font-medium">{describeRequest(myPending, church.id)}</p>
                <p className="text-xs text-muted-foreground">
                  Aguardando a aprovação da igreja-mãe · pedido de {formatDate(myPending.requestedAt)}
                </p>
              </div>
              <CancelRequestButton requestId={myPending.id} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canInvite.length > 0 ? (
        <CreateInviteCard key={church.id} church={church} options={canInvite} invites={invites} />
      ) : null}

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de pedidos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {history.map((request) => (
                <li key={request.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">{describeRequest(request, church.id)}</span>
                    <Badge variant={REQUEST_STATUS_VARIANT[request.status]}>{REQUEST_STATUS_LABEL[request.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(request.requestedAt)}
                    {request.tipoFinal && request.tipoFinal !== request.tipoSolicitado
                      ? ` · aprovado como ${LINK_TIPO_LABEL[request.tipoFinal].toLowerCase()}`
                      : ""}
                  </p>
                  {request.status === "recusado" && request.motivoRecusa ? (
                    <p className="text-xs">
                      <span className="font-medium">Motivo:</span> {request.motivoRecusa}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
