"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Mostra um toast a partir de um Server Component, para o aviso de "acabei
 * de fazer algo" que hoje chega via redirect + searchParam (ex.: publicar um
 * evento, registrar um patrocínio) — não dá para chamar `toast()` direto no
 * servidor, então isto roda uma vez, no mount, no client.
 */
export function FlashToast({
  message,
  variant = "success",
}: {
  message: string;
  variant?: "success" | "error";
}) {
  useEffect(() => {
    if (variant === "error") toast.error(message);
    else toast.success(message);
  }, [message, variant]);
  return null;
}
