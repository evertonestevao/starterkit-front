"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMoneyInput } from "@/hooks/useMoneyInput";
import { definirMensalidadeAction } from "@/server/actions/platform";
import { formatCents } from "@/services/sponsorPricing";

/**
 * Valor da mensalidade de UMA igreja, definido pela plataforma: um desconto,
 * ou um valor simbólico para a igreja de teste. Em branco = volta ao padrão.
 */
export function MensalidadeForm({
  churchId,
  valorProprioCents,
  motivo,
  valorPadraoCents,
  pagando,
}: {
  churchId: string;
  valorProprioCents: number | null;
  motivo: string | null;
  valorPadraoCents: number;
  pagando: boolean;
}) {
  const valor = useMoneyInput(valorProprioCents);
  const [porque, setPorque] = useState(motivo ?? "");
  const [pending, start] = useTransition();

  function enviar(fd: FormData) {
    start(async () => {
      const r = await definirMensalidadeAction(undefined, fd);
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Mensalidade salva.");
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">
        {valorProprioCents === null
          ? `Paga o padrão: ${formatCents(valorPadraoCents)}/mês.`
          : `Valor próprio: ${formatCents(valorProprioCents)}/mês (o padrão é ${formatCents(valorPadraoCents)}).`}{" "}
        {pagando
          ? "Já tem cobrança correndo: o valor novo vale a partir da próxima."
          : "Ainda não cadastrou o pagamento."}
      </p>
      <form action={enviar} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="churchId" value={churchId} />
        <div className="flex w-32 flex-col gap-1.5">
          <Label htmlFor={`mens-valor-${churchId}`}>Valor por mês</Label>
          <Input
            id={`mens-valor-${churchId}`}
            name="valor"
            inputMode="numeric"
            autoComplete="off"
            placeholder={formatCents(valorPadraoCents)}
            value={valor.value}
            onChange={valor.onChange}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={`mens-motivo-${churchId}`}>Motivo</Label>
          <Input
            id={`mens-motivo-${churchId}`}
            name="motivo"
            maxLength={200}
            placeholder="Ex.: igreja de teste, desconto de parceria"
            value={porque}
            onChange={(e) => setPorque(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm" disabled={pending || valor.value === ""}>
          {pending ? "Salvando..." : "Salvar valor"}
        </Button>
      </form>
      {valorProprioCents !== null ? (
        <form action={enviar}>
          <input type="hidden" name="churchId" value={churchId} />
          <input type="hidden" name="valor" value="" />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            Voltar ao padrão ({formatCents(valorPadraoCents)})
          </Button>
        </form>
      ) : null}
      <p className="text-xs text-muted-foreground">Mínimo de R$ 5,00. A mudança fica registrada com o seu nome.</p>
    </div>
  );
}
