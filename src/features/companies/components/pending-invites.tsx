"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTenant } from "@/providers/tenant-provider";
import { revokeInviteAction } from "@/server/actions/tenant";
import type { CompanyInvite } from "@/types/database";

export function PendingInvites({ invites }: { invites: CompanyInvite[] }) {
  const { active } = useTenant();
  const [pending, startTransition] = useTransition();

  if (invites.length === 0) return null;

  function revoke(inviteId: string) {
    startTransition(async () => {
      try {
        const result = await revokeInviteAction(inviteId, active.id);
        if (result?.error) {
          toast.error(result.error);
        } else {
          toast.success("Convite revogado");
        }
      } catch {
        toast.error("Não foi possível revogar o convite. Tente novamente.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {invites.map((invite) => (
        <Card key={invite.id}>
          <CardContent className="flex items-center gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{invite.email}</p>
              <p className="text-xs text-muted-foreground">
                expira em {new Date(invite.expires_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="secondary">{invite.role === "admin" ? "Admin" : "Member"}</Badge>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                onClick={() => revoke(invite.id)}
                aria-label={`Revogar convite de ${invite.email}`}
              >
                <X className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
