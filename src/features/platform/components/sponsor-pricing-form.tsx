"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { useMoneyInput } from "@/hooks/useMoneyInput";
import type { PriceTier } from "@/services/sponsorPricing";
import { updateSponsorPricingAction } from "@/server/actions/platform";

/** Um campo de valor por posição — próprio componente porque cada um chama `useMoneyInput`. */
function TierAmountField({ position, initialCents }: { position: number; initialCents: number }) {
  const { value, onChange } = useMoneyInput(initialCents);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`amount_${position}`}>{position}ª posição</Label>
      <Input
        id={`amount_${position}`}
        name={`amount_${position}`}
        value={value}
        onChange={onChange}
        inputMode="numeric"
        placeholder="R$ 0,00"
        required
        className="max-w-40"
      />
    </div>
  );
}

/**
 * Preço do patrocínio por posição: 1ª igreja que alguém patrocina paga o
 * tier 1, a 2ª o tier 2, e assim por diante — sem linha pra uma posição, ela
 * repete o valor da última. Editar aqui salva a tabela inteira de uma vez
 * (é uma RPC só, atômica): não dá para "só mudar uma linha".
 */
export function SponsorPricingForm({ tiers }: { tiers: PriceTier[] }) {
  const [state, formAction, pending] = useActionState(updateSponsorPricingAction, undefined);
  useActionToast(state);
  // Cada posição é um número de 1..N; adicionar/remover só muda N. A última
  // posição existente serve de sugestão para a próxima que for criada.
  const [posicoes, setPosicoes] = useState(() => tiers.map((t) => t.position));
  const ultimoValor = tiers.at(-1)?.amountCents ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preço do patrocínio</CardTitle>
        <CardDescription>
          Por posição, não por igreja: a 1ª igreja que o patrocinador apoia paga o valor da 1ª
          posição, a 2ª paga o da 2ª, e assim por diante. Sem posição cadastrada para o número de
          igrejas, vale o valor da última. Cobranças já feitas não mudam — o preço novo vale a
          partir da próxima.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Formulario action={formAction} estado={state} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            {posicoes.map((position) => (
              <div key={position} className="flex items-end gap-1">
                <TierAmountField
                  position={position}
                  initialCents={tiers.find((t) => t.position === position)?.amountCents ?? ultimoValor}
                />
                {posicoes.length > 1 && position === posicoes.length ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover a ${position}ª posição`}
                    onClick={() => setPosicoes((p) => p.slice(0, -1))}
                    className="mb-0.5 text-muted-foreground"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPosicoes((p) => [...p, p.length + 1])}
              className="w-fit gap-1.5"
            >
              <Plus className="size-4" aria-hidden />
              Adicionar posição
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar preços"}
            </Button>
          </div>
        </Formulario>
      </CardContent>
    </Card>
  );
}
