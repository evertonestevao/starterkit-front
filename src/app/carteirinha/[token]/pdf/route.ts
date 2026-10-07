import { NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { getCarteirinhaService } from "@/server/carteirinha";
import { gerarCarteirinhaPdf } from "@/server/carteirinhaPdf";

/** A carteirinha em PDF, pelo link pessoal, para o próprio membro imprimir. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const service = await getCarteirinhaService();
    const carteirinha = await service.porToken(token);
    if (!carteirinha) return new NextResponse("Não encontrado", { status: 404 });
    const pdf = await gerarCarteirinhaPdf({
      carteirinha,
      foto: carteirinha.temFoto ? await service.fotoPorToken(token) : null,
      logo: await service.logo(carteirinha.logoUrl),
      urlVerificacao: `${getServerEnv().APP_URL.replace(/\/+$/, "")}/verificar/${carteirinha.codigo}`,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="carteirinha.pdf"',
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    console.error("[carteirinha] falha ao gerar o PDF pelo link", err);
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
