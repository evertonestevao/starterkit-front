"use client";

import { Formulario } from "@/components/formulario";
import { useActionState } from "react";
import { LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionToast } from "@/hooks/useActionToast";
import { releaseSecurityHoldAction } from "@/server/actions/platform";
import type { SecurityHold } from "@/types/sponsorship";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Contas travadas pelo "não fui eu".
 *
 * Liberar não republica o que foi desfeito: devolve só a possibilidade de
 * pedir de novo. Quem clicou no link do email pode ter sido o dono legítimo
 * avisando que a conta foi invadida — republicar aqui seria decidir por ele
 * exatamente no caso em que há dúvida sobre quem é ele.
 */
export function SecurityHoldList({ holds }: { holds: SecurityHold[] }) {
  const [state, formAction, pending] = useActionState(releaseSecurityHoldAction, undefined);
  useActionToast(state);

  if (holds.length === 0) return null;

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LockOpen className="size-4 text-destructive" aria-hidden />
          Contas bloqueadas por segurança
        </CardTitle>
        <CardDescription>
          O dono do email clicou em “não fui eu”. Confirme com ele antes de liberar — pode ter sido
          conta invadida. Liberar só devolve a possibilidade de pedir alteração; nada volta ao ar
          sozinho.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {holds.map((hold) => (
          <div
            key={hold.sponsorAccountId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{hold.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {hold.email} · bloqueada em {formatDateTime(hold.securityHoldAt)}
              </p>
              {hold.ultimaTentativaNome ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Tentaram publicar: <span className="font-medium">{hold.ultimaTentativaNome}</span>
                </p>
              ) : null}
            </div>
            <Formulario action={formAction} estado={state}>
              <input type="hidden" name="sponsorAccountId" value={hold.sponsorAccountId} />
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                Liberar conta
              </Button>
            </Formulario>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
