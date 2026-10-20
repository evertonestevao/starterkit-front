"use client";

import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, Lock, LockOpen, X } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Formulario } from "@/components/formulario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  definirCadastroAbertoAction,
  gerarConviteIgrejaAction,
  revogarConviteIgrejaAction,
} from "@/server/actions/cadastroConvite";
import type { ConviteIgreja } from "@/services/cadastroConviteService";

const data = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

/** Interruptor do cadastro + convites de igreja nova (uso único). */
export function CadastroConvites({
  aberto,
  convites,
  agora,
}: {
  aberto: boolean;
  convites: ConviteIgreja[];
  agora: string;
}) {
  const [pending, startTransition] = useTransition();

  function situacao(c: ConviteIgreja): { rotulo: string; ativo: boolean } {
    if (c.usadoEm) return { rotulo: c.igreja ? `Usado: ${c.igreja}` : "Usado", ativo: false };
    if (c.revogadoEm) return { rotulo: "Cancelado", ativo: false };
    if (c.expiraEm <= agora) return { rotulo: "Vencido", ativo: false };
    return { rotulo: `Vale até ${data(c.expiraEm)}`, ativo: true };
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {aberto ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            Cadastro {aberto ? "aberto" : "só por convite"}
          </CardTitle>
          <CardDescription>
            {aberto
              ? "Qualquer pessoa cria conta e cadastra uma igreja pelo site."
              : "Os botões de criar conta saíram do site. Conta nova só por um link (convite de membro, vínculo da rede ou convite daqui), e o banco recusa igreja nova sem convite."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant={aberto ? "outline" : "default"}
            disabled={pending}
            onClick={async () => {
              const sim = await confirmar({
                titulo: aberto ? "Fechar o cadastro?" : "Abrir o cadastro para qualquer igreja?",
                descricao: aberto
                  ? "Igreja nova passa a entrar só por convite."
                  : "Qualquer pessoa poderá criar conta e cadastrar uma igreja pelo site.",
                botao: aberto ? "Fechar" : "Abrir",
                perigo: !aberto,
              });
              if (!sim) return;
              startTransition(async () => {
                const r = await definirCadastroAbertoAction(!aberto);
                if (r.error) toast.error(r.error);
                else if (r.success) toast.success(r.success);
              });
            }}
          >
            {aberto ? "Fechar o cadastro" : "Abrir o cadastro"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Convite de igreja nova</CardTitle>
          <CardDescription>
            Para uma igreja de fora das redes que já usam o sistema. O link serve uma vez só: a pessoa cria a conta (ou
            entra) e cadastra a igreja.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <GerarConvite />
          {convites.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-lg border">
              {convites.map((c) => {
                const s = situacao(c);
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{c.descricao}</span>
                      <span className="block text-xs text-muted-foreground">Gerado em {data(c.criadoEm)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge variant={s.ativo ? "default" : "secondary"}>{s.rotulo}</Badge>
                      {s.ativo ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          aria-label={`Cancelar o convite de ${c.descricao}`}
                          onClick={() =>
                            startTransition(async () => {
                              const r = await revogarConviteIgrejaAction(c.id);
                              if (r.error) toast.error(r.error);
                              else if (r.success) toast.success(r.success);
                            })
                          }
                        >
                          <X className="size-3.5" /> Cancelar
                        </Button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

function GerarConvite() {
  const [state, action, pending] = useActionState(gerarConviteIgrejaAction, undefined);
  const { copied, copy } = useCopyToClipboard(2500);
  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <div className="flex flex-col gap-3">
      <Formulario action={action} estado={state} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="descricao">Para quem é</Label>
          <Input
            id="descricao"
            name="descricao"
            required
            minLength={2}
            maxLength={120}
            placeholder="Ex.: Pr. João, AD Brás"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="validadeDias">Vale por (dias)</Label>
          <Input id="validadeDias" name="validadeDias" type="number" min={1} max={30} defaultValue={7} required />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Gerando..." : "Gerar link"}
        </Button>
      </Formulario>
      {state?.success ? (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3" role="status">
          <p className="text-sm font-medium">
            Link gerado (vale até {data(state.success.expiraEm)}). Copie agora: ele não aparece de novo.
          </p>
          <p className="break-all font-mono text-xs">{state.success.link}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => copy(state.success!.link)}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Link copiado" : "Copiar link"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
