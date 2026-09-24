"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "@/server/actions/tenant";

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const result = await acceptInviteAction(token);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Button onClick={accept} disabled={pending} className="w-full">
      {pending ? "Aceitando..." : "Aceitar convite"}
    </Button>
  );
}
