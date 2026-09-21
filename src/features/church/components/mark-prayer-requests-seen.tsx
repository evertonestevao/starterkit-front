"use client";

import { useEffect, useRef } from "react";
import { markPrayerRequestsSeenAction } from "@/server/actions/community";

/**
 * Espera antes de marcar como visto, para o selo "Novo" e o badge do menu
 * não sumirem no instante em que a página abre — a pessoa precisa de um
 * tempo para notar o que chegou antes de o aviso desaparecer.
 *
 * `markPrayerRequestsSeenAction` chama `revalidatePath`, e uma Server
 * Function chamada direto (sem `<form>`) já atualiza a tela sozinha assim
 * que termina — não precisa de `router.refresh()` depois. Por isso é a
 * CHAMADA da action que precisa esperar, não algo depois dela: atrasar só
 * um refresh redundante não atrasaria nada, o sumiço já teria acontecido.
 */
const ATRASO_ANTES_DE_MARCAR_MS = 8_000;

/**
 * Dispara "marcar como visto" quando a pessoa REALMENTE abre a tela.
 *
 * Precisa ser um client component reagindo a montagem, não um efeito colateral
 * no corpo da página (Server Component): o Next.js pré-carrega uma rota ao
 * passar o mouse sobre o link do menu, o que re-executaria a página no
 * servidor SEM o usuário ter clicado — e a marca de "visto" sumiria do badge
 * antes de alguém realmente ler o pedido. Um efeito de montagem só dispara
 * quando o componente entra de fato na árvore visível.
 *
 * Se a pessoa sair da tela antes do atraso terminar, a marca nunca chega a
 * ser gravada nesta visita — de propósito: "abriu e fechou na hora" não é a
 * mesma coisa que "abriu e leu". Na próxima visita, ainda conta como novo.
 */
export function MarkPrayerRequestsSeen({
  companyId,
  seenUpTo,
}: {
  companyId: string;
  /** `created_at` do pedido mais recente mostrado nesta visita. Null = nada a marcar. */
  seenUpTo: string | null;
}) {
  // Evita duplicar a chamada se o componente re-renderizar (o StrictMode do
  // React roda efeitos duas vezes em dev). A RPC já é idempotente — isto só
  // evita uma chamada de rede à toa.
  const jaMarcou = useRef(false);

  useEffect(() => {
    if (!seenUpTo || jaMarcou.current) return;

    const temporizador = setTimeout(() => {
      jaMarcou.current = true;
      void markPrayerRequestsSeenAction(companyId, seenUpTo);
    }, ATRASO_ANTES_DE_MARCAR_MS);

    return () => clearTimeout(temporizador);
  }, [companyId, seenUpTo]);

  return null;
}
