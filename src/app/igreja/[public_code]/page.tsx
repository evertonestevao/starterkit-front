import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { features } from "@/config/features";
import { RegistraServiceWorker } from "@/components/pwa/instalar-app";
import { CABECALHO_DOMINIO_DA_IGREJA } from "@/lib/churchPaths";
import { COR_PADRAO_DO_APP, inicioDoAppDaIgreja, nomeCurtoDoApp } from "@/lib/appDaIgreja";
import { notFound, permanentRedirect } from "next/navigation";
import { ChurchPageRenderer } from "@/features/church/church-page-templates";
import { VISIT_ORIGIN_PARAM } from "@/lib/churchVisits";
import { buildPixPayload } from "@/lib/pixPayload";
import { qrPngDataUrl } from "@/lib/qr";
import { trackChurchVisit } from "@/server/churchVisits";
import { enderecoAtualDoCodigoAntigo, getPublicChurchRepository, loadPublicChurch } from "@/server/publicChurch";
import { getVendasPublicasService } from "@/server/vendas";

/** Quantos eventos a página inicial mostra antes do "ver todos os eventos". */
const EVENTOS_NA_PREVIA = 3;

type ParamsDaIgreja = { params: Promise<{ public_code: string }> };

/** O pedido chegou pelo domínio próprio da igreja? (o proxy marca quando reescreve o endereço dela) */
async function noDominioProprio(): Promise<boolean> {
  return (await headers()).get(CABECALHO_DOMINIO_DA_IGREJA) === "1";
}

/**
 * Além do título, a página da igreja vira um app instalável PRÓPRIO (nome,
 * logo e cor dela), separado do painel. O manifesto diz onde o app abre no
 * endereço que a pessoa está usando.
 */
export async function generateMetadata({ params }: ParamsDaIgreja): Promise<Metadata> {
  const { public_code } = await params;
  const carregado = await loadPublicChurch(public_code).catch(() => null);
  if (!carregado) return {};
  const { church, previa } = carregado;
  const titulo = church.sobrenome ? `${church.name} - ${church.sobrenome}` : church.name;
  if (previa) return { title: titulo };

  const codigo = encodeURIComponent(church.public_code);
  const inicio = inicioDoAppDaIgreja(church.public_code, await noDominioProprio());
  return {
    title: titulo,
    manifest: `/api/igreja-app/manifest?c=${codigo}&inicio=${encodeURIComponent(inicio)}`,
    appleWebApp: { capable: true, title: nomeCurtoDoApp(church.name), statusBarStyle: "default" },
    icons: { apple: `/api/igreja-app/icone?c=${codigo}&t=180` },
  };
}

export async function generateViewport({ params }: ParamsDaIgreja): Promise<Viewport> {
  const { public_code } = await params;
  const carregado = await loadPublicChurch(public_code).catch(() => null);
  const cor = carregado?.accent;
  return { themeColor: cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor : COR_PADRAO_DO_APP };
}

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
  const [sponsors, eventos, campanhas, programacao, linkCartao, linkPix, temRede, temVendas] = await Promise.all([
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
    // Só para saber se o atalho "Vendas" aparece; a lista tem tela própria.
    getVendasPublicasService()
      .then((s) => s.listar(church.id))
      .then((l) => l.length > 0)
      .catch((err: unknown) => {
        console.error("[church-page] falha ao carregar vendas", err);
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
    <>
      {previa ? null : <RegistraServiceWorker />}
      <ChurchPageRenderer
        church={church}
        sponsors={sponsors}
        eventos={eventos}
        campanhas={campanhas}
        temVendas={temVendas}
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
    </>
  );
}
