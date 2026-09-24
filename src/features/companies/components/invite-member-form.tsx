"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import { useTenant } from "@/providers/tenant-provider";
import { inviteMemberAction } from "@/server/actions/tenant";

export function InviteMemberForm() {
  const { active } = useTenant();
  const [state, formAction, pending] = useActionState(inviteMemberAction, undefined);
  useActionToast(state);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="companyId" value={active.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" placeholder="pessoa@igreja.com" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-role">Papel</Label>
        {/* select nativo: funciona sem JS e evita divergência de API de lib */}
        <select
          id="invite-role"
          name="role"
          defaultValue="member"
          className="border-input h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <option value="member">Member — acesso operacional</option>
          <option value="admin">Admin — gerencia membros e configurações</option>
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Enviar convite"}
      </Button>
    </form>
  );
}
