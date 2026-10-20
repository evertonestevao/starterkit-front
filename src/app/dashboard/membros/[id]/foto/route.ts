import { NextResponse } from "next/server";
import { getCarteirinhaActorAutorizado, getCarteirinhaService } from "@/server/carteirinha";
import { getMenusVisiveis } from "@/server/menuPermissoes";

/**
 * A foto do membro, para a ficha. O bucket é privado: quem entrega a imagem é
 * este handler, depois de conferir o menu Membros e de o service ler o
 * consentimento com a permissão de quem pede (membro de outra igreja não vem).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCarteirinhaActorAutorizado();
  if (!actor || !(await getMenusVisiveis()).includes("membros")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  try {
    const foto = await (await getCarteirinhaService()).foto(actor, id);
    if (!foto) return new NextResponse("Não encontrado", { status: 404 });
    return new NextResponse(Buffer.from(foto.bytes), {
      headers: {
        "Content-Type": foto.tipo,
        // Dado pessoal: nada de cache compartilhado, e a foto trocada aparece na hora.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Não encontrado", { status: 404 });
  }
}
