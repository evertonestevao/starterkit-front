import { NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { getCarteirinhaActorAutorizado, getCarteirinhaService } from "@/server/carteirinha";
import { gerarCarteirinhaPdf } from "@/server/carteirinhaPdf";
import { getMenusVisiveis } from "@/server/menuPermissoes";

/**
 * A carteirinha do membro em PDF, para a secretaria imprimir. Sem o menu
 * Membros, 404; a carteirinha e a foto são lidas com a permissão de quem pede.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCarteirinhaActorAutorizado();
  if (!actor || !(await getMenusVisiveis()).includes("membros")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  try {
    const service = await getCarteirinhaService();
    const carteirinha = await service.carteirinha(actor, id);
    if (!carteirinha || carteirinha.estado === "cancelada") return new NextResponse("Não encontrado", { status: 404 });
    const pdf = await gerarCarteirinhaPdf({
      carteirinha,
      foto: carteirinha.temFoto ? await service.foto(actor, id) : null,
      logo: await service.logo(carteirinha.logoUrl),
      urlVerificacao: `${getServerEnv().APP_URL.replace(/\/+$/, "")}/verificar/${carteirinha.codigo}`,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="carteirinha.pdf"',
      },
    });
  } catch (err) {
    console.error("[carteirinha] falha ao gerar o PDF", err);
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
