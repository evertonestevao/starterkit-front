"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SELECT_CLASS } from "./action-form";

/** Campos tipo, valor e duração, comuns à regra e ao ajuste por cliente. */
export function CommissionFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: { type: string; value: string; durationMonths: number | null };
}) {
  const [type, setType] = useState(defaults?.type ?? "percent");
  const isPercent = type === "percent";

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-type`}>Tipo</Label>
        <select
          id={`${idPrefix}-type`}
          name="commissionType"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className={SELECT_CLASS}
        >
          <option value="percent">Percentual</option>
          <option value="fixed">Valor fixo por pagamento</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-value`}>{isPercent ? "Valor (%)" : "Valor (R$ por pagamento)"}</Label>
        <Input
          id={`${idPrefix}-value`}
          name="value"
          inputMode="decimal"
          placeholder={isPercent ? "30" : "19,90"}
          defaultValue={defaults?.value}
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-duration`}>Duração em meses</Label>
        <Input
          id={`${idPrefix}-duration`}
          name="durationMonths"
          type="number"
          min={1}
          placeholder="Enquanto pagar"
          defaultValue={defaults?.durationMonths ?? undefined}
        />
      </div>
    </>
  );
}
