"use client";

import { Formulario } from "@/components/formulario";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { useMoneyInput } from "@/hooks/useMoneyInput";
import { GATEWAY_FEE_HINT, PIX_HINT } from "@/features/campaigns/paymentMethodCopy";
import { createCampaignAction } from "@/server/actions/campaigns";

/**
 * Criar campanha. Nasce em rascunho — ativar (e publicar na página) é um
 * passo à parte, na tela de gerenciar, depois de revisar tudo.
 */
export function NewCampaignForm({ igrejas }: { igrejas: Array<{ id: string; name: string }> }) {
  const [state, formAction, pending] = useActionState(createCampaignAction, undefined);
  useActionToast(state);
  const unica = igrejas.length === 1 ? igrejas[0] : null;
  const meta = useMoneyInput();
  const sugerido1 = useMoneyInput();
  const sugerido2 = useMoneyInput();
  const sugerido3 = useMoneyInput();
  const sugeridos = [sugerido1, sugerido2, sugerido3];

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-5">
      {unica ? (
        <input type="hidden" name="churchId" value={unica.id} />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="churchId">Igreja</Label>
          <select
            id="churchId"
            name="churchId"
            required
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {igrejas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" required minLength={2} maxLength={120} placeholder="Ex.: Reforma do telhado" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="historia">História do projeto</Label>
        <textarea
          id="historia"
          name="historia"
          required
          minLength={10}
          maxLength={8000}
          rows={8}
          placeholder="Conte o que vai ser feito, por que é importante e como o dinheiro será usado."
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="meta">Meta (total a arrecadar)</Label>
        <Input
          id="meta"
          name="meta"
          required
          inputMode="decimal"
          maxLength={20}
          placeholder="R$ 0,00"
          className="sm:max-w-56"
          value={meta.value}
          onChange={meta.onChange}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Como vai receber as ofertas</legend>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="metodoRecebimento" value="pix" defaultChecked required className="mt-0.5" />
          <span>
            PIX direto
            <span className="block text-xs text-muted-foreground">{PIX_HINT}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name="metodoRecebimento" value="gateway" required className="mt-0.5" />
          <span>
            Cartão ou Pix automático
            <span className="block text-xs text-muted-foreground">{GATEWAY_FEE_HINT}</span>
          </span>
        </label>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="mostrarProgresso" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <span>
          Mostrar barra de progresso na página
          <span className="block text-xs text-muted-foreground">
            Some com o total já arrecadado. Pode desligar depois, a qualquer momento.
          </span>
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Valores sugeridos <span className="font-normal text-muted-foreground">(opcional, até 3)</span>
        </legend>
        <p className="text-xs text-muted-foreground">
          Preencha os que quiser — cada um vira um botão de valor na página. Nenhum precisa vir marcado
          como &ldquo;vem selecionado&rdquo;; é só um atalho opcional para quem doa não precisar escolher.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Label htmlFor={`valorSugerido${i}`} className="text-xs text-muted-foreground">
                Valor {i}
              </Label>
              <Input
                id={`valorSugerido${i}`}
                name={`valorSugerido${i}`}
                inputMode="decimal"
                maxLength={20}
                placeholder="R$ 0,00"
                value={sugeridos[i - 1].value}
                onChange={sugeridos[i - 1].onChange}
              />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="radio" name="valorPadraoIndice" value={String(i)} className="size-3.5" />
                Vem selecionado na página
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="permitirValorLivre" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <span>
          Permitir que a pessoa digite outro valor
          <span className="block text-xs text-muted-foreground">
            Desligue só se quiser aceitar exclusivamente os valores sugeridos acima.
          </span>
        </span>
      </label>

      <div className="flex">
        <Button type="submit" disabled={pending}>
          {pending ? "Criando..." : "Criar campanha"}
        </Button>
      </div>
    </Formulario>
  );
}
