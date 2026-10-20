"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState } from "react";
import { Eye, EyeOff, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import {
  reportSponsorAbuseAction,
  setSponsorHiddenAction,
} from "@/server/actions/churchSponsors";

/**
 * O que a igreja pode fazer com quem a patrocina.
 *
 * Dois caminhos de propósito diferentes, e a tela precisa deixar claro qual é
 * qual: esconder é decisão dela, vale na hora e não cancela nada; denunciar
 * manda o caso para a plataforma. Quem só não gosta da marca não deveria
 * precisar acusar ninguém de abuso para resolver.
 */
export function SponsorCardActions({
  sponsorshipId,
  hidden,
  denunciaAberta,
}: {
  sponsorshipId: string;
  hidden: boolean;
  denunciaAberta: boolean;
}) {
  const [hideState, hideAction, hidePending] = useActionState(setSponsorHiddenAction, undefined);
  useActionToast(hideState);
  const [reportState, reportAction, reportPending] = useActionState(
    reportSponsorAbuseAction,
    undefined,
  );
  useActionToast(reportState);
  const [denunciando, setDenunciando] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {denunciando ? (
        <Formulario action={reportAction} estado={reportState} className="flex flex-col gap-2">
          <input type="hidden" name="sponsorshipId" value={sponsorshipId} />
          <Label htmlFor={`motivo-${sponsorshipId}`}>O que houve?</Label>
          <Input
            id={`motivo-${sponsorshipId}`}
            name="motivo"
            required
            minLength={5}
            maxLength={1000}
            placeholder="Descreva o problema com este patrocinador."
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="destructive" disabled={reportPending}>
              {reportPending ? "Enviando..." : "Enviar denúncia"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDenunciando(false)}
              disabled={reportPending}
            >
              Cancelar
            </Button>
          </div>
        </Formulario>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Formulario action={hideAction} estado={hideState}>
            <input type="hidden" name="sponsorshipId" value={sponsorshipId} />
            <input type="hidden" name="acao" value={hidden ? "exibir" : "esconder"} />
            <Button type="submit" size="sm" variant="outline" disabled={hidePending} className="gap-1.5">
              {hidden ? (
                <>
                  <Eye className="size-3.5" aria-hidden />
                  Exibir de novo
                </>
              ) : (
                <>
                  <EyeOff className="size-3.5" aria-hidden />
                  Esconder da página
                </>
              )}
            </Button>
          </Formulario>

          {denunciaAberta ? (
            <span className="self-center text-xs text-muted-foreground">
              Denúncia em análise
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDenunciando(true)}
              className="gap-1.5"
            >
              <Flag className="size-3.5" aria-hidden />
              Denunciar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
