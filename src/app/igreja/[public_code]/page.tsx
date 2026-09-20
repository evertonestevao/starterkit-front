import { notFound } from "next/navigation";
import { ChurchPageRenderer } from "@/features/church/church-page-templates";
import { VISIT_ORIGIN_PARAM } from "@/lib/churchVisits";
import { trackChurchVisit } from "@/server/churchVisits";
import { getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";

/** Quantos eventos a página inicial mostra antes do "ver todos os eventos". */
const EVENTOS_NA_PREVIA = 3;

export default async function PublicChurchPage({
  params,
  searchParams,
}: {
  params: Promise<{ public_code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ public_code }, query] = await Promise.all([params, searchParams]);
  const carregado = await loadPublicChurch(public_code);
  if (!carregado) notFound();
  const { church, theme } = carregado;

  // Conta a abertura (link, QR ou NFC) depois da resposta; nunca bloqueia.
  await trackChurchVisit(church.id, query[VISIT_ORIGIN_PARAM]);

  const repo = await getPublicChurchRepository();
  // Nenhuma das duas listas pode derrubar a página da igreja: vazia é melhor
  // do que tela de erro para quem veio pelo QR Code.
  const [sponsors, eventos, programacao] = await Promise.all([
    repo.listPublicSponsors(church.id).catch((err: unknown) => {
      console.error("[church-page] falha ao carregar patrocinadores", err);
      return [];
    }),
    repo.listUpcomingEvents(church.id, EVENTOS_NA_PREVIA).catch((err: unknown) => {
      console.error("[church-page] falha ao carregar eventos", err);
      return [];
    }),
    repo.listSchedule(church.id).catch((err: unknown) => {
      console.error("[church-page] falha ao carregar a programação", err);
      return [];
    }),
  ]);

  return (
    <ChurchPageRenderer
      church={church}
      sponsors={sponsors}
      eventos={eventos}
      programacao={programacao}
      templateSlug={theme}
    />
  );
}
