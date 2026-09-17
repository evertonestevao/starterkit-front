"use client";

import { useActionState, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  HandHeart,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  claimCustomDomainAction,
  removeCustomDomainAction,
  verifyCustomDomainAction,
} from "@/server/actions/churchDomain";
import type { ChurchDomainStatus } from "@/types/database";
import type { ChurchDomainView, DnsRecordInstruction } from "@/types/domain";

/**
 * Seção "Domínio próprio" do painel da igreja.
 *
 * A tela é deliberadamente organizada em torno de uma ideia: o endereço padrão
 * aparece primeiro e sempre, porque é o que nunca deixa de funcionar. O domínio
 * customizado é apresentado como um extra opcional, não como o jeito certo.
 */

interface StatusPresentation {
  label: string;
  variant: "default" | "secondary" | "outline" | "destructive";
  explanation: string;
}

const STATUS_PRESENTATION: Record<ChurchDomainStatus, StatusPresentation> = {
  nao_configurado: {
    label: "Não configurado",
    variant: "outline",
    explanation:
      "Sua igreja está no endereço padrão. Se quiser, cadastre um domínio próprio abaixo.",
  },
  pendente_dns: {
    label: "Aguardando DNS",
    variant: "secondary",
    explanation:
      "Falta criar os registros abaixo no painel de quem registrou seu domínio (Registro.br, GoDaddy, Hostinger...). Depois disso, a ativação é automática.",
  },
  verificando: {
    label: "Verificando",
    variant: "secondary",
    explanation:
      "Encontramos seus registros e estamos concluindo a ativação, incluindo o certificado de segurança. Costuma levar poucos minutos.",
  },
  ativo: {
    label: "Ativo",
    variant: "default",
    explanation: "Seu domínio está no ar, com certificado de segurança emitido.",
  },
  erro: {
    label: "Precisa de atenção",
    variant: "destructive",
    explanation:
      "Não conseguimos concluir a verificação. Revise os registros de DNS e peça uma nova verificação — sua igreja continua acessível pelo endereço padrão o tempo todo.",
  },
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard bloqueado (http, permissão negada): o valor segue
          // visível e selecionável na tela, então não é um beco sem saída.
          toast.error("Não foi possível copiar. Selecione o texto manualmente.");
        }
      }}
      aria-label={`Copiar ${label}`}
    >
      {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

/** Tabela no desktop, cards no mobile (regra de layout do projeto). */
function DnsInstructions({ records }: { records: DnsRecordInstruction[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 font-medium">Tipo</th>
              <th className="px-2 py-2 font-medium">Nome</th>
              <th className="px-2 py-2 font-medium">Valor</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={`${record.type}-${record.name}`} className="border-b last:border-0">
                <td className="px-2 py-3 font-medium">{record.type}</td>
                <td className="px-2 py-3 font-mono text-xs">{record.name}</td>
                <td className="px-2 py-3 font-mono text-xs break-all">{record.value}</td>
                <td className="px-2 py-3 text-right">
                  <CopyButton value={record.value} label={`valor do registro ${record.type}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {records.map((record) => (
          <div key={`${record.type}-${record.name}`} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline">{record.type}</Badge>
              <CopyButton value={record.value} label={`valor do registro ${record.type}`} />
            </div>
            <dl className="mt-2 flex flex-col gap-1 text-xs">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Nome:</dt>
                <dd className="font-mono">{record.name}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-muted-foreground">Valor:</dt>
                <dd className="font-mono break-all">{record.value}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {records.map((record) => (
          <li key={`hint-${record.type}-${record.name}`}>
            <span className="font-medium">{record.type}:</span> {record.hint}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CustomDomainSection({
  view,
  canManage,
}: {
  view: ChurchDomainView;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(claimCustomDomainAction, undefined);
  const [busy, startTransition] = useTransition();
  const presentation = STATUS_PRESENTATION[view.status];
  const hasDomain = Boolean(view.domain);

  function runAction(action: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      if (result?.success) {
        toast.success(result.success);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Endereço padrão primeiro, de propósito: é o que sempre funciona. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            Endereço padrão
          </CardTitle>
          <CardDescription>
            Sempre disponível, incluído no plano e sem nenhuma configuração. Continua
            funcionando mesmo que você cadastre um domínio próprio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="min-w-0 flex-1 font-mono text-sm break-all">
            {view.defaultUrl}
          </span>
          <CopyButton value={view.defaultUrl} label="endereço padrão" />
          <Button variant="ghost" size="sm" className="gap-1.5" render={
            <a href={view.defaultUrl} target="_blank" rel="noreferrer" />
          }>
            <ExternalLink className="size-3.5" />
            Abrir
          </Button>
        </CardContent>
      </Card>

      {/* O link que transforma visitante em patrocinador. Sem ele exposto
          aqui, o pastor não tinha como divulgar o convite. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandHeart className="size-4 text-primary" />
            Convite para patrocinadores
          </CardTitle>
          <CardDescription>
            Envie este link para negócios e pessoas que queiram apoiar a igreja. Quem abrir vê o
            convite e assina sem precisar de conta antes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
          <span className="min-w-0 flex-1 font-mono text-sm break-all">
            {view.sponsorInviteUrl}
          </span>
          <CopyButton value={view.sponsorInviteUrl} label="link de patrocínio" />
          <Button variant="ghost" size="sm" className="gap-1.5" render={
            <a href={view.sponsorInviteUrl} target="_blank" rel="noreferrer" />
          }>
            <ExternalLink className="size-3.5" />
            Abrir
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Domínio próprio</CardTitle>
              <CardDescription className="mt-1">
                Opcional: use um endereço da sua igreja, como igrejaexemplo.com.br
              </CardDescription>
            </div>
            <Badge variant={presentation.variant}>{presentation.label}</Badge>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">{presentation.explanation}</p>

          {view.status === "erro" && view.lastError ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>{view.lastError}</AlertDescription>
            </Alert>
          ) : null}

          {view.customUrl ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <CheckCircle2 className="size-4 text-primary" />
              <span className="min-w-0 flex-1 font-mono text-sm break-all">
                {view.customUrl}
              </span>
              <Button variant="ghost" size="sm" className="gap-1.5" render={
                <a href={view.customUrl} target="_blank" rel="noreferrer" />
              }>
                <ExternalLink className="size-3.5" />
                Abrir
              </Button>
            </div>
          ) : null}

          {canManage ? (
            <form action={formAction} className="flex flex-col gap-3">
              {state?.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              ) : null}
              {state?.success ? (
                <Alert>
                  <AlertDescription>{state.success}</AlertDescription>
                </Alert>
              ) : null}

              <input type="hidden" name="churchId" value={view.churchId} />
              <div className="flex flex-col gap-2">
                <Label htmlFor={`domain-${view.churchId}`}>
                  {hasDomain ? "Trocar domínio" : "Seu domínio"}
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`domain-${view.churchId}`}
                    name="domain"
                    placeholder="igrejaexemplo.com.br"
                    defaultValue={view.domain ?? ""}
                    autoComplete="off"
                    spellCheck={false}
                    required
                    minLength={4}
                    maxLength={253}
                    className="sm:flex-1"
                  />
                  <Button type="submit" disabled={pending || busy}>
                    {pending ? "Salvando..." : hasDomain ? "Atualizar" : "Cadastrar"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Digite só o endereço, sem http:// e sem barra no final. Você precisa já
                  ter registrado esse domínio (no Registro.br ou equivalente).
                </p>
              </div>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Só quem administra a igreja pode configurar o domínio próprio.
            </p>
          )}

          {hasDomain && view.dns.length > 0 && view.status !== "ativo" ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">Registros de DNS</p>
                <p className="text-xs text-muted-foreground">
                  Crie estes registros no painel onde você registrou{" "}
                  <span className="font-mono">{view.domain}</span>. A propagação pode levar
                  de alguns minutos a algumas horas.
                </p>
              </div>
              <DnsInstructions records={view.dns} />
            </div>
          ) : null}

          {canManage && hasDomain ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={busy || pending}
                onClick={() => runAction(() => verifyCustomDomainAction(view.churchId))}
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Verificar agora
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="gap-2 text-destructive"
                disabled={busy || pending}
                onClick={() => runAction(() => removeCustomDomainAction(view.churchId))}
              >
                <Trash2 className="size-4" />
                Remover domínio
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Prefere que a gente configure?</CardTitle>
          <CardDescription>
            Cadastrar o domínio é <strong>gratuito</strong> e você mesma consegue fazer: é
            copiar os registros acima e colar no painel do seu domínio. Se preferir não
            mexer nisso, existe um serviço opcional de configuração assistida, cobrado uma
            única vez — a gente configura para você.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2" render={
            <a href="mailto:suporte@tagigreja.com.br?subject=Configuração%20de%20domínio%20próprio" />
          }>
            Quero ajuda para configurar
          </Button>
          {view.supportPaid ? (
            <Badge variant="secondary">Configuração assistida contratada</Badge>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
