import { NextResponse } from "next/server";
import { getCarteirinhaService } from "@/server/carteirinha";

/**
 * A foto da carteirinha, pelo link pessoal. Sem login: o link é a credencial.
 * Link trocado, carteirinha cancelada ou foto sem consentimento: 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const foto = await (await getCarteirinhaService()).fotoPorToken(token);
    if (!foto) return new NextResponse("Não encontrado", { status: 404 });
    return new NextResponse(Buffer.from(foto.bytes), {
      headers: {
        "Content-Type": foto.tipo,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
