"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "@/server/actions/tenant";

export function AcceptInviteButton({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const result = await acceptInviteAction(token);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button onClick={accept} disabled={pending} className="w-full">
        {pending ? "Aceitando..." : "Aceitar convite"}
      </Button>
    </div>
  );
}
