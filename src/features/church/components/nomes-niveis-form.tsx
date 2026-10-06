"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Layers, RotateCcw } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import {
  NIVEIS,
  NOMES_PADRAO,
  NOME_NIVEL_MAX,
  NOME_NIVEL_MIN,
  saoNomesPadrao,
  type NomesNiveis,
} from "@/lib/niveisRede";
import { restaurarNomesNiveisAction, salvarNomesNiveisAction } from "@/server/actions/niveisRede";
import type { ChurchTipo } from "@/types/database";

const EXPLICACAO: Record<ChurchTipo, string> = {
  sede: "A igreja do topo da rede (a sua).",
  subsede: "Igrejas ligadas direto à do nível 1, que podem ter outras abaixo.",
  congregacao: "Igrejas da ponta: ligadas ao nível 1 ou ao nível 2.",
};

/**
 * Como a rede chama cada um dos três níveis. Só o Responsável da sede vê este
 * cartão; os nomes valem para todas as igrejas da rede.
 */
export function NomesNiveisForm({ churchId, nomes }: { churchId: string; nomes: NomesNiveis }) {
  const [state, formAction, pending] = useActionState(salvarNomesNiveisAction, undefined);
  useActionToast(state);
  const [restaurando, startRestaurar] = useTransition();
  const ocupado = pending || restaurando;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4 text-primary" aria-hidden /> Nomes dos níveis da rede
        </CardTitle>
        <CardDescription>
          A rede tem três níveis. Se a sua igreja usa outros nomes (filial, campo, setor, ponto de pregação...), troque
          aqui: eles passam a aparecer no sistema para todas as igrejas da sua rede. A organização da rede não muda.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* A `key` remonta o formulário quando os nomes mudam (salvar ou restaurar). */}
        <form action={formAction} className="flex flex-col gap-4" key={JSON.stringify(nomes)}>
          <input type="hidden" name="churchId" value={churchId} />
          {NIVEIS.map((nivel, i) => (
            <fieldset key={nivel} className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-medium">
                Nível {i + 1}
                <span className="block text-xs font-normal text-muted-foreground">{EXPLICACAO[nivel]}</span>
              </legend>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${nivel}-singular`}>Uma igreja</Label>
                <Input
                  id={`${nivel}-singular`}
                  name={`${nivel}_singular`}
                  defaultValue={nomes[nivel].singular}
                  placeholder={NOMES_PADRAO[nivel].singular}
                  required
                  minLength={NOME_NIVEL_MIN}
                  maxLength={NOME_NIVEL_MAX}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${nivel}-plural`}>Várias (plural)</Label>
                <Input
                  id={`${nivel}-plural`}
                  name={`${nivel}_plural`}
                  defaultValue={nomes[nivel].plural}
                  placeholder={NOMES_PADRAO[nivel].plural}
                  required
                  minLength={NOME_NIVEL_MIN}
                  maxLength={NOME_NIVEL_MAX}
                />
              </div>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!saoNomesPadrao(nomes) ? (
              <Button
                type="button"
                variant="ghost"
                disabled={ocupado}
                onClick={async () => {
                  const sim = await confirmar({
                    titulo: "Voltar aos nomes padrão?",
                    descricao: "A rede inteira volta a ver Sede, Subsede e Congregação.",
                    botao: "Restaurar padrão",
                  });
                  if (!sim) return;
                  startRestaurar(async () => {
                    const r = await restaurarNomesNiveisAction(churchId);
                    if (r.error) toast.error(r.error);
                    if (r.success) toast.success(r.success);
                  });
                }}
              >
                <RotateCcw className="size-3.5" /> Restaurar padrão
              </Button>
            ) : null}
            <Button type="submit" disabled={ocupado}>
              {pending ? "Salvando..." : "Salvar nomes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
