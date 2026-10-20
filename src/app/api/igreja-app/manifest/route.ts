import { COR_PADRAO_DO_APP, inicioDoAppDaIgreja, inicioSeguro, manifestoDaIgreja } from "@/lib/appDaIgreja";
import { loadPublicChurch } from "@/server/publicChurch";

/**
 * Manifesto do app de UMA igreja (a página pública instalada no celular).
 *
 * Fica em /api, e não dentro de /igreja/..., para ser servido igual no
 * endereço da plataforma e no domínio próprio da igreja (o proxy deixa
 * /api/igreja-app passar sem reescrever). `inicio` diz onde o app abre no
 * endereço que a pessoa está usando; a página que linka o manifesto calcula.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const codigo = url.searchParams.get("c") ?? "";
  if (!/^[a-z0-9-]+(~[a-z0-9-]+)?$/.test(codigo)) return new Response("não encontrado", { status: 404 });

  const carregado = await loadPublicChurch(codigo).catch(() => null);
  // Página fora do ar (ou que só o administrador vê como prévia) não vira app.
  if (!carregado || carregado.previa) return new Response("não encontrado", { status: 404 });
  const { church, accent } = carregado;

  const manifesto = manifestoDaIgreja({
    nome: church.name,
    sobrenome: church.sobrenome,
    publicCode: church.public_code,
    inicio: inicioSeguro(url.searchParams.get("inicio"), inicioDoAppDaIgreja(church.public_code, false)),
    cor: accent ?? COR_PADRAO_DO_APP,
  });
  return new Response(JSON.stringify(manifesto), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
