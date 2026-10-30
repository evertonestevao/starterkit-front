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
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-type`}>Tipo</Label>
        <select
          id={`${idPrefix}-type`}
          name="commissionType"
          defaultValue={defaults?.type ?? "percent"}
          className={SELECT_CLASS}
        >
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor fixo por mês (R$)</option>
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-value`}>Valor</Label>
        <Input id={`${idPrefix}-value`} name="value" inputMode="decimal" defaultValue={defaults?.value} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-duration`}>Duração em meses (vazio = enquanto pagar)</Label>
        <Input
          id={`${idPrefix}-duration`}
          name="durationMonths"
          type="number"
          min={1}
          defaultValue={defaults?.durationMonths ?? undefined}
        />
      </div>
    </>
  );
}
