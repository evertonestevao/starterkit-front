"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markCommissionsPaidAction } from "../actions";
import { formatCents } from "../format";
import { ActionForm } from "./action-form";

/**
 * Barra do lote. As caixas ficam nas linhas da lista, ligadas ao form pelo atributo
 * `form`, e levam o valor em data-cents, para mostrar o total antes de confirmar.
 */
export function BulkPaidBar({ formId, today, selectable }: { formId: string; today: string; selectable: number }) {
  const [selected, setSelected] = useState({ count: 0, cents: 0 });

  const boxes = useCallback(
    () => [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"]`)],
    [formId],
  );

  const recount = useCallback(() => {
    const checked = boxes().filter((box) => box.checked);
    setSelected({
      count: checked.length,
      cents: checked.reduce((total, box) => total + Number(box.dataset.cents ?? 0), 0),
    });
  }, [boxes]);

  useEffect(() => {
    document.addEventListener("change", recount);
    return () => document.removeEventListener("change", recount);
  }, [recount]);

  function toggleAll(checked: boolean) {
    for (const box of boxes()) box.checked = checked;
    recount();
  }

  return (
    <ActionForm
      id={formId}
      action={markCommissionsPaidAction}
      submitLabel="Marcar selecionados como pagos"
      submitDisabled={selected.count === 0}
      className="flex flex-wrap items-end gap-4"
    >
      <label className="flex h-8 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          disabled={selectable === 0}
          checked={selectable > 0 && selected.count === selectable}
          onChange={(event) => toggleAll(event.target.checked)}
        />
        Selecionar todos os pendentes ({selectable})
      </label>
      <div className="flex flex-col gap-2">
        <Label htmlFor="paid-at">Data do pagamento</Label>
        <Input id="paid-at" name="paidAt" type="date" defaultValue={today} required />
      </div>
      <p className="flex h-8 items-center text-sm text-muted-foreground" aria-live="polite">
        {selected.count === 0
          ? "Nenhum selecionado"
          : `${selected.count} selecionado(s): ${formatCents(selected.cents)}`}
      </p>
    </ActionForm>
  );
}
