import { ImageResponse } from "next/og";
import { getClientEnv } from "@/config/env";
import { COR_PADRAO_DO_APP, iniciaisDaIgreja, tamanhoDeIcone } from "@/lib/appDaIgreja";
import { MAX_LOGO_BYTES, sniffImageType } from "@/lib/imageValidation";
import { loadPublicChurch } from "@/server/publicChurch";

/**
 * Ícone do app da igreja: a logo dela, centralizada num quadrado branco (cabe
 * logo larga, alta ou pequena). Sem logo, ou com logo que não dá para
 * desenhar, as iniciais da igreja na cor dela.
 *
 * `m=1` é a versão "maskable": o Android recorta o ícone em círculo ou gota,
 * então a logo fica mais para dentro (área segura de 80%).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const codigo = url.searchParams.get("c") ?? "";
  if (!/^[a-z0-9-]+(~[a-z0-9-]+)?$/.test(codigo)) return new Response("não encontrado", { status: 404 });
  const tamanho = tamanhoDeIcone(url.searchParams.get("t"));
  const mascara = url.searchParams.get("m") === "1";

  const carregado = await loadPublicChurch(codigo).catch(() => null);
  if (!carregado || carregado.previa) return new Response("não encontrado", { status: 404 });
  const { church, accent } = carregado;
  const cor = accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : COR_PADRAO_DO_APP;

  const logo = await logoDesenhavel(church.logo_url);
  // Área da logo: 76% do ícone normal; 56% no maskable (fica dentro do círculo de recorte).
  const area = Math.round(tamanho * (mascara ? 0.56 : 0.76));

  return new ImageResponse(
    logo ? (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- desenhado pelo ImageResponse, não é página */}
        <img src={logo} alt="" width={area} height={area} style={{ objectFit: "contain" }} />
      </div>
    ) : (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: cor,
          color: "#ffffff",
          fontSize: Math.round(tamanho * (mascara ? 0.3 : 0.4)),
          fontWeight: 700,
        }}
      >
        {iniciaisDaIgreja(church.name)}
      </div>
    ),
    {
      width: tamanho,
      height: tamanho,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}

/**
 * A logo como data URL, se der para desenhar: só do armazenamento do próprio
 * sistema (nada de buscar endereço qualquer), até 1MB, e PNG ou JPEG — o
 * gerador de imagem não lê WebP. Qualquer falha vira "sem logo".
 */
async function logoDesenhavel(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const alvo = new URL(logoUrl);
    if (alvo.origin !== new URL(getClientEnv().NEXT_PUBLIC_SUPABASE_URL).origin) return null;
    const resp = await fetch(alvo, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (bytes.byteLength > MAX_LOGO_BYTES) return null;
    const tipo = sniffImageType(bytes);
    if (tipo !== "image/png" && tipo !== "image/jpeg") return null;
    return `data:${tipo};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
