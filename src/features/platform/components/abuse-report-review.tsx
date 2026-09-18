"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reviewAbuseReportAction } from "@/server/actions/platform";
import type { AbuseReport } from "@/types/sponsorship";

/**
 * Decisão de uma denúncia.
 *
 * Fechar o chamado não tira o patrocinador de página nenhuma — quem esconde é
 * cada igreja, por conta própria. Se a marca precisa sair de todo lugar, isso
 * é ação sobre a conta, deliberada, não efeito colateral de clicar aqui. A
 * nota existe porque daqui a seis meses ninguém lembra do caso.
 */
export function AbuseReportReview({ report }: { report: AbuseReport }) {
  const [state, formAction, pending] = useActionState(reviewAbuseReportAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="reportId" value={report.id} />

      <div className="flex flex-col gap-2">
        <Label htmlFor={`nota-${report.id}`}>Nota interna (opcional)</Label>
        <Input
          id={`nota-${report.id}`}
          name="nota"
          maxLength={500}
          placeholder="O que você verificou e decidiu."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decisao"
          value="procedente"
          size="sm"
          variant="destructive"
          disabled={pending}
          className="gap-1.5"
        >
          <Check className="size-4" aria-hidden />
          Procedente
        </Button>
        <Button
          type="submit"
          name="decisao"
          value="improcedente"
          size="sm"
          variant="outline"
          disabled={pending}
          className="gap-1.5"
        >
          <X className="size-4" aria-hidden />
          Improcedente
        </Button>
      </div>
    </form>
  );
}
