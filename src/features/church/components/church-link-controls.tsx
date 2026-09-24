"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToastedAction } from "@/hooks/useToastedAction";
import { formatChurchName } from "@/lib/churchName";
import { LINK_TIPO_LABEL, moveDestinations } from "@/lib/churchLinks";
import { changeChurchPositionAction, endChurchLinkAction } from "@/server/actions/churchLinks";
import type { ChurchLinkChurch, ChurchLinkNode } from "@/types/churchLinks";

export const selectClasses =
  "h-9 min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Botão que pede confirmação antes de desfazer: é uma ação que a outra igreja sente. */
export function EndLinkButton({ churchId, label }: { churchId: string; label: string }) {
  // O botão some quando o vínculo acaba: o aviso não pode depender dele.
  const [formAction, pending] = useToastedAction(endChurchLinkAction);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirmando(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="churchId" value={churchId} />
      <span className="text-xs text-muted-foreground">A outra igreja é avisada. Confirmar?</span>
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        {pending ? "Desfazendo..." : "Sim, desfazer"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(false)} disabled={pending}>
        Voltar
      </Button>
    </form>
  );
}

/**
 * A igreja-mãe muda a função de uma igreja ligada a ela (ou a uma subsede dela);
 * a igreja movida é avisada. `currentParentId` é a igreja a que ela está ligada
 * hoje: o destino que já é o dela não aparece.
 */
export function MovePositionForm({
  church,
  filhas,
  moving,
  currentParentId,
}: {
  church: ChurchLinkChurch;
  /** As igrejas ligadas diretamente a `church`: são os destinos possíveis (as subsedes). */
  filhas: ChurchLinkNode[];
  moving: ChurchLinkNode;
  currentParentId: string;
}) {
  const [formAction, pending] = useToastedAction(changeChurchPositionAction);
  const [aberto, setAberto] = useState(false);

  // Só monta a lista de destinos depois de aberto: com centenas de subsedes, cada linha
  // fechada não precisa dela.
  const opcoes = aberto
    ? moveDestinations(
        { id: church.id, tipo: church.tipo, parentId: church.parentId },
        filhas.map((f) => ({ id: f.id, tipo: f.tipo })),
        moving,
      )
        .flatMap((d) => {
          const pai = d.parentId === church.id ? church : filhas.find((f) => f.id === d.parentId);
          const paiNome = pai ? formatChurchName(pai.name, pai.sobrenome) : "";
          return d.tipos.map((tipo) => ({
            valor: `${d.parentId}|${tipo}`,
            rotulo: `${LINK_TIPO_LABEL[tipo]} de ${paiNome}`,
            parentId: d.parentId,
            tipo,
          }));
        })
        .filter((d) => !(d.parentId === currentParentId && d.tipo === moving.tipo))
    : [];

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        Mudar função
      </Button>
    );
  }
  if (opcoes.length === 0) {
    return <span className="text-xs text-muted-foreground">Sem outra função possível.</span>;
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="childId" value={moving.id} />
      <label className="sr-only" htmlFor={`destino-${moving.id}`}>
        Nova função de {moving.name}
      </label>
      <select id={`destino-${moving.id}`} name="destino" className={selectClasses} defaultValue={opcoes[0].valor}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)} disabled={pending}>
        Voltar
      </Button>
    </form>
  );
}
