import { features } from "@/config/features";
import { notFound, permanentRedirect } from "next/navigation";
import { ChurchPageRenderer } from "@/features/church/church-page-templates";
import { VISIT_ORIGIN_PARAM } from "@/lib/churchVisits";
import { buildPixPayload } from "@/lib/pixPayload";
import { qrPngDataUrl } from "@/lib/qr";
import { trackChurchVisit } from "@/server/churchVisits";
import { enderecoAtualDoCodigoAntigo, getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";

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
  if (!carregado) {
    // Link ou QR antigo de uma igreja que entrou numa rede: leva ao endereço
    // novo, mantendo a origem (qr/nfc) para a contagem de visitas.
    const destino = await enderecoAtualDoCodigoAntigo(public_code);
    if (destino) {
      const origem = query[VISIT_ORIGIN_PARAM];
      const valor = Array.isArray(origem) ? origem[0] : origem;
      permanentRedirect(valor ? `${destino}?${VISIT_ORIGIN_PARAM}=${encodeURIComponent(valor)}` : destino);
    }
    notFound();
  }
  const { church, theme, accent, previa } = carregado;

  // Conta a abertura (link, QR ou NFC) depois da resposta; nunca bloqueia.
  // A prévia de quem administra não é visita.
  if (!previa) await trackChurchVisit(church.id, query[VISIT_ORIGIN_PARAM]);

  const repo = await getPublicChurchRepository();
  // Nenhuma das duas listas pode derrubar a página da igreja: vazia é melhor
  // do que tela de erro para quem veio pelo QR Code.
  const [sponsors, eventos, campanhas, programacao, linkCartao, linkPix, temRede] = await Promise.all([
    // Porta fechada pra patrocinador (ou patrocínio fora das telas): nem
    // consulta — a seção nem aparece.
    !church.aceita_patrocinio || !features.patrocinioVisivel
      ? Promise.resolve([])
      : repo.listPublicSponsors(church.id).catch((err: unknown) => {
          console.error("[church-page] falha ao carregar patrocinadores", err);
          return [];
        }),
    repo.listUpcomingEvents(church.id, EVENTOS_NA_PREVIA).catch((err: unknown) => {
      console.error("[church-page] falha ao carregar eventos", err);
      return [];
    }),
    repo.listActiveCampaigns(church.id).catch((err: unknown) => {
      console.error("[church-page] falha ao carregar campanhas", err);
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
    // Só consulta se a igreja realmente escolheu Pix pela Asaas — economiza
    // uma chamada para o caso comum (chave própria).
    church.pix_fonte !== "asaas"
      ? Promise.resolve(null)
      : repo.getPixDonationLink(church.id).catch((err: unknown) => {
          console.error("[church-page] falha ao carregar o link de pix", err);
          return null;
        }),
    // Igreja do topo com igrejas abaixo: ganha o atalho "Nossas igrejas", que
    // abre a lista numa tela própria. A lista em si não é carregada aqui.
    church.parent_id !== null
      ? Promise.resolve(false)
      : repo.hasChildChurches(church.id).catch((err: unknown) => {
          console.error("[church-page] falha ao verificar a rede", err);
          return false;
        }),
  ]);

  // O QR do PIX sai da chave da própria igreja e aponta direto para ela: a
  // plataforma não entra no caminho do dinheiro. Falhar aqui não pode
  // derrubar a página — a chave copiável continua valendo. Só gera quando a
  // fonte é "propria": com "asaas", quem doa usa o link da Asaas, não a chave.
  let pixCopiaECola: string | null = null;
  let pixQrDataUrl: string | null = null;
  if (church.pix_fonte === "propria" && church.pix_chave) {
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
      campanhas={campanhas}
      programacao={programacao}
      pixCopiaECola={pixCopiaECola}
      pixQrDataUrl={pixQrDataUrl}
      linkCartao={linkCartao}
      linkPix={linkPix}
      temRede={temRede}
      previa={previa}
      templateSlug={theme}
      accent={accent}
    />
  );
}
