"use client";

import { Label } from "@/components/ui/label";
import type { ChurchProfile } from "@/services/churchProfileService";
import { selectClasses } from "./church-link-controls";

/** Escolhe qual igreja da conta está sendo editada (só aparece com mais de uma). */
export function SeletorDeIgreja({
  igrejas,
  valor,
  aoTrocar,
}: {
  igrejas: ChurchProfile[];
  valor: string;
  aoTrocar: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="igreja">Igreja</Label>
      <select id="igreja" className={selectClasses} value={valor} onChange={(e) => aoTrocar(e.target.value)}>
        {igrejas.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </div>
  );
}
