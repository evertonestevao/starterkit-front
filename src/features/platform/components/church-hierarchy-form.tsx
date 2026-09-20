"use client";

import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setChurchHierarchyAction } from "@/server/actions/platform";
import {
  allowedParents,
  CHURCH_TIPO_LABEL,
  CHURCH_TIPOS,
  type ChurchTreeNode,
} from "@/services/churchHierarchyService";
import type { ChurchTipo } from "@/types/database";

const selectClasses =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Tipo e igreja acima, para UMA igreja. As opções de "acima de" são só as
 * válidas para o tipo escolhido (e nunca a própria subárvore); o servidor e o
 * banco validam de novo.
 */
export function ChurchHierarchyForm({
  church,
  all,
}: {
  church: ChurchTreeNode;
  all: ChurchTreeNode[];
}) {
  const [state, formAction, pending] = useActionState(setChurchHierarchyAction, undefined);
  const [tipo, setTipo] = useState<ChurchTipo>(church.tipo);
  const opcoes = allowedParents(church, tipo, all);
  const parentAtualValido = opcoes.some((c) => c.id === church.parentId);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="churchId" value={church.id} />
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
        <select
          name="tipo"
          aria-label={`Tipo de ${church.name}`}
          value={tipo}
          onChange={(e) => setTipo(e.target.value as ChurchTipo)}
          className={selectClasses}
        >
          {CHURCH_TIPOS.map((t) => (
            <option key={t} value={t}>
              {CHURCH_TIPO_LABEL[t]}
            </option>
          ))}
        </select>
        {/* key: troca de tipo recria o select com um valor que ainda existe. */}
        <select
          key={tipo}
          name="parentId"
          aria-label={`Igreja acima de ${church.name}`}
          defaultValue={parentAtualValido ? (church.parentId ?? "") : ""}
          className={selectClasses}
          disabled={tipo === "sede"}
        >
          {tipo !== "congregacao" ? <option value="">Nenhuma (fica solta)</option> : null}
          {opcoes.map((c) => (
            <option key={c.id} value={c.id}>
              {CHURCH_TIPO_LABEL[c.tipo]} · {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Salvar
        </Button>
      </div>
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state?.success ? <p className="text-xs text-primary">{state.success}</p> : null}
    </form>
  );
}
