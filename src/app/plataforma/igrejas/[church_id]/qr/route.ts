import { getServerEnv } from "@/config/env";
import { churchTagUrl, parseVisitOrigin } from "@/lib/churchVisits";
import { isAppError, toPublicError } from "@/lib/errors";
import { qrPngDataUrl, qrSvg } from "@/lib/qr";
import { requirePlatformStaff } from "@/server/platform";
import { getSupabaseServerClient } from "@/server/supabase-server";

/**
 * QR Code da igreja para download (PNG ou SVG).
 *
 * Gerado sob demanda, e não junto com a lista: a tela mostra dezenas de
 * igrejas, e desenhar um QR de cada uma a cada abertura seria trabalho jogado
 * fora — quase todos nunca são baixados.
 *
 * A origem entra no endereço (?origem=qr ou ?origem=nfc) para as métricas
 * separarem quem chegou pelo material impresso de quem chegou pela tag.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ church_id: string }> },
) {
  try {
    await requirePlatformStaff();
    const { church_id } = await params;
    const url = new URL(request.url);
    const formato = url.searchParams.get("formato") === "svg" ? "svg" : "png";
    const origem = parseVisitOrigin(url.searchParams.get("origem") ?? undefined);

    const supabase = await getSupabaseServerClient();
    const { data: church } = await supabase
      .from("churches")
      .select("public_code")
      .eq("id", church_id)
      .maybeSingle<{ public_code: string }>();
    if (!church) return Response.json({ error: "not_found" }, { status: 404 });

    const alvo = churchTagUrl(
      getServerEnv().APP_URL,
      church.public_code,
      origem === "nfc" ? "nfc" : "qr",
    );
    const nome = `${church.public_code}-${origem}`;

    if (formato === "svg") {
      return new Response(await qrSvg(alvo), {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Content-Disposition": `attachment; filename="${nome}.svg"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const dataUrl = await qrPngDataUrl(alvo, 1024);
    const png = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${nome}.png"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (!isAppError(err)) console.error("[plataforma/qr]", err);
    return Response.json({ error: toPublicError(err) }, { status: isAppError(err) ? err.status : 500 });
  }
}
