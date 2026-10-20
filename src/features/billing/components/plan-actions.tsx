"use client";

import { Formulario } from "@/components/formulario";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/hooks/useActionToast";
import { useTenant } from "@/providers/tenant-provider";
import {
  activateFakePlanAction,
  cancelSubscriptionAction,
  checkoutAction,
} from "@/server/actions/billing";

/** Botão de assinar um plano. Com gateway fake, ativa direto (dev). */
export function SubscribeButton({
  planId,
  isFakeGateway,
  isCurrent,
}: {
  planId: string;
  isFakeGateway: boolean;
  isCurrent: boolean;
}) {
  const { active } = useTenant();
  const action = isFakeGateway ? activateFakePlanAction : checkoutAction;
  const [state, formAction, pending] = useActionState(action, undefined);
  useActionToast(state);

  if (isCurrent) {
    return (
      <Button disabled variant="secondary" className="w-full">
        Plano atual
      </Button>
    );
  }

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-2">
      <input type="hidden" name="companyId" value={active.id} />
      <input type="hidden" name="planId" value={planId} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Processando..." : isFakeGateway ? "Ativar (dev)" : "Assinar"}
      </Button>
    </Formulario>
  );
}

export function CancelSubscriptionButton() {
  const { active } = useTenant();
  const [state, formAction, pending] = useActionState(cancelSubscriptionAction, undefined);
  useActionToast(state);

  return (
    <Formulario action={formAction} estado={state} className="flex flex-col gap-2">
      <input type="hidden" name="companyId" value={active.id} />
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Cancelando..." : "Cancelar assinatura"}
      </Button>
    </Formulario>
  );
}
