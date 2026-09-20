import { notFound } from "next/navigation";
import { ChurchPageRenderer } from "@/features/church/church-page-templates";
import { VISIT_ORIGIN_PARAM } from "@/lib/churchVisits";
import { buildPixPayload } from "@/lib/pixPayload";
import { qrPngDataUrl } from "@/lib/qr";
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
  const [sponsors, eventos, programacao, linkCartao] = await Promise.all([
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
    repo.getCardDonationLink(church.id).catch((err: unknown) => {
      console.error("[church-page] falha ao carregar o link de cartão", err);
      return null;
    }),
  ]);

  // O QR do PIX sai da chave da própria igreja e aponta direto para ela: a
  // plataforma não entra no caminho do dinheiro. Falhar aqui não pode
  // derrubar a página — a chave copiável continua valendo.
  let pixCopiaECola: string | null = null;
  let pixQrDataUrl: string | null = null;
  if (church.pix_chave) {
    try {
      pixCopiaECola = buildPixPayload({
        chave: church.pix_chave,
        titular: church.pix_titular ?? church.name,
        cidade: church.address?.split(/[-,]/).at(-1)?.trim(),
      });
      pixQrDataUrl = await qrPngDataUrl(pixCopiaECola, 512);
    } catch (err) {
      console.error("[church-page] falha ao gerar o QR do PIX", err);
      pixCopiaECola = null;
      pixQrDataUrl = null;
    }
  }

  return (
    <ChurchPageRenderer
      church={church}
      sponsors={sponsors}
      eventos={eventos}
      programacao={programacao}
      pixCopiaECola={pixCopiaECola}
      pixQrDataUrl={pixQrDataUrl}
      linkCartao={linkCartao}
      templateSlug={theme}
    />
  );
}
