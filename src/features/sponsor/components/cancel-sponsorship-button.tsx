"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCents } from "@/services/sponsorPricing";
import { cancelSponsorshipAction } from "@/server/actions/sponsor";

/**
 * Cancelamento com confirmação. O diálogo mostra o total que passa a valer —
 * sem isso, ver outra igreja "subir de preço" depois de cancelar parece erro.
 */
export function CancelSponsorshipButton({
  sponsorshipId,
  churchName,
  newTotalCents,
  isPending,
}: {
  sponsorshipId: string;
  churchName: string;
  newTotalCents: number;
  /** Aguardando o 1º pagamento: cancela na hora, sem ciclo a cumprir. */
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      const result = await cancelSponsorshipAction(sponsorshipId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success ?? "Patrocínio cancelado.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        Cancelar
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar o apoio a {churchName}?</DialogTitle>
          <DialogDescription>
            {isPending
              ? "O pedido ainda não foi pago, então é encerrado agora."
              : "A igreja continua exibindo seu apoio até o fim do ciclo já pago."}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border p-3 text-sm">
          <p className="text-muted-foreground">Seu total mensal passa a ser</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatCents(newTotalCents)}</p>
          {newTotalCents > 0 ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              O valor de cada igreja depende da ordem: as que ficam passam a ocupar as primeiras
              faixas da tabela. O total acima já considera isso.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Sem outras igrejas, as próximas cobranças deixam de acontecer.
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
            Manter apoio
          </DialogClose>
          <Button type="button" variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? "Cancelando..." : "Cancelar apoio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
