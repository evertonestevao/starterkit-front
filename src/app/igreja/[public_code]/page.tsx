import { notFound } from "next/navigation";
import { ChurchPageRenderer } from "@/features/church/church-page-templates";
import { getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";

/** Quantos eventos a página inicial mostra antes do "ver todos os eventos". */
const EVENTOS_NA_PREVIA = 3;

export default async function PublicChurchPage({
  params,
}: {
  params: Promise<{ public_code: string }>;
}) {
  const { public_code } = await params;
  const carregado = await loadPublicChurch(public_code);
  if (!carregado) notFound();
  const { church, theme } = carregado;

  const repo = await getPublicChurchRepository();
  // Nenhuma das duas listas pode derrubar a página da igreja: vazia é melhor
  // do que tela de erro para quem veio pelo QR Code.
  const [sponsors, eventos] = await Promise.all([
    repo.listPublicSponsors(church.id).catch((err: unknown) => {
      console.error("[church-page] falha ao carregar patrocinadores", err);
      return [];
    }),
    repo.listUpcomingEvents(church.id, EVENTOS_NA_PREVIA).catch((err: unknown) => {
      console.error("[church-page] falha ao carregar eventos", err);
      return [];
    }),
  ]);

  return (
    <ChurchPageRenderer church={church} sponsors={sponsors} eventos={eventos} templateSlug={theme} />
  );
}
