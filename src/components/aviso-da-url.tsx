"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { PARAMETRO_DE_AVISO, avisoDaChave } from "@/lib/avisos";

/**
 * Mostra, como toast, o aviso que veio na URL depois de um redirect
 * (`?aviso=senha-trocada`) e tira o parâmetro do endereço — recarregar a
 * página não repete o aviso.
 */
export function AvisoDaUrl() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const chave = params.get(PARAMETRO_DE_AVISO);

  useEffect(() => {
    const aviso = avisoDaChave(chave);
    if (!chave) return;
    if (aviso) toast[aviso.tipo](aviso.texto);
    const resto = new URLSearchParams(params.toString());
    resto.delete(PARAMETRO_DE_AVISO);
    const query = resto.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [chave, params, pathname, router]);

  return null;
}
