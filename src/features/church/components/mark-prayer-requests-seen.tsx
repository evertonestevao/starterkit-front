"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { markPrayerRequestsSeenAction } from "@/server/actions/community";

/**
 * Dispara "marcar como visto" quando a pessoa REALMENTE abre a tela.
 *
 * Precisa ser um client component reagindo a montagem, não um efeito colateral
 * no corpo da página (Server Component): o Next.js pré-carrega uma rota ao
 * passar o mouse sobre o link do menu, o que re-executaria a página no
 * servidor SEM o usuário ter clicado — e a marca de "visto" sumiria do badge
 * antes de alguém realmente ler o pedido. Um efeito de montagem só dispara
 * quando o componente entra de fato na árvore visível.
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
  const router = useRouter();

  useEffect(() => {
    if (!seenUpTo || jaMarcou.current) return;
    jaMarcou.current = true;
    void markPrayerRequestsSeenAction(companyId, seenUpTo).then(() => {
      // `revalidatePath` na action invalida o cache, mas só troca o que já
      // está montado na tela com uma navegação — e aqui não há nenhuma
      // (o efeito roda na MESMA página). É isto que faz o badge do menu
      // sumir sem precisar sair e voltar.
      router.refresh();
    });
  }, [companyId, seenUpTo, router]);

  return null;
}
