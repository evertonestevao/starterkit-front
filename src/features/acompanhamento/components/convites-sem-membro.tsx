"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/providers/tenant-provider";
import { revokeInviteAction } from "@/server/actions/tenant";
import type { ConvitePendente } from "@/types/acompanhamento";
import { PAPEL_LABEL } from "./acesso-membro";

/** Convites pendentes para e-mails que ainda não são membros (ao aceitar, viram). */
export function ConvitesSemMembro({ convites }: { convites: ConvitePendente[] }) {
  const { active } = useTenant();
  const [pending, start] = useTransition();

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {convites.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="min-w-0 break-all">
            {c.email} <span className="text-muted-foreground">· {PAPEL_LABEL[c.role]}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await revokeInviteAction(c.id, active.id);
                if (r?.error) toast.error(r.error);
                else toast.success("Convite cancelado.");
              })
            }
          >
            <X className="size-3.5" /> Cancelar
          </Button>
        </li>
      ))}
    </ul>
  );
}
