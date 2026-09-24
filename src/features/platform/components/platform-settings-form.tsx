"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { updatePlatformSettingsAction } from "@/server/actions/platform";
import type { PlatformSettings } from "@/types/platform";

/** `null` vira campo vazio, que é como "ilimitado" se escreve na tela. */
function valor(n: number | null): string {
  return n === null ? "" : String(n);
}

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const [state, formAction, pending] = useActionState(updatePlatformSettingsAction, undefined);
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Vagas de primeiro patrocínio</CardTitle>
          <CardDescription>
            Quantos patrocinadores podem ter cada tipo de igreja como a igreja principal deles.
            Deixe vazio para não limitar. Zero fecha a igreja para novos patrocinadores. A expansão
            — a segunda, terceira e demais igrejas de quem já patrocina — nunca ocupa vaga nem é
            limitada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vagasSede">Sede</Label>
            <Input
              id="vagasSede"
              name="vagasSede"
              inputMode="numeric"
              defaultValue={valor(settings.vagasSede)}
              placeholder="ilimitado"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vagasSubsede">Subsede</Label>
            <Input
              id="vagasSubsede"
              name="vagasSubsede"
              inputMode="numeric"
              defaultValue={valor(settings.vagasSubsede)}
              placeholder="ilimitado"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vagasCongregacao">Congregação</Label>
            <Input
              id="vagasCongregacao"
              name="vagasCongregacao"
              inputMode="numeric"
              defaultValue={valor(settings.vagasCongregacao)}
              placeholder="ilimitado"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carência da marca</CardTitle>
          <CardDescription>
            Dias de atraso no pagamento até a marca do patrocinador sair da vitrine da igreja. Ela
            volta sozinha quando o pagamento entra. A conta é feita na hora em que a página é
            aberta, então mudar este número vale para todo mundo no acesso seguinte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex max-w-[12rem] flex-col gap-1.5">
            <Label htmlFor="carenciaMarcaDias">Dias</Label>
            <Input
              id="carenciaMarcaDias"
              name="carenciaMarcaDias"
              inputMode="numeric"
              required
              defaultValue={String(settings.carenciaMarcaDias)}
            />
          </div>
        </CardContent>
      </Card>

      <div>
        <Button type="submit" disabled={pending}>
          Salvar configurações
        </Button>
      </div>
    </form>
  );
}
