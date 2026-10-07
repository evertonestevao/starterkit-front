import { NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { hojeISO } from "@/lib/acompanhamento";
import { validadePadrao } from "@/lib/carteirinha";
import { carteirinhaDeExemplo, logoDaCarteirinha } from "@/lib/carteirinhaModelo";
import { getCarteirinhaActorAutorizado, getCarteirinhaService } from "@/server/carteirinha";
import { gerarCarteirinhaPdf } from "@/server/carteirinhaPdf";
import { getSecretariaActorAutorizado, getSecretariaService } from "@/server/secretaria";

/**
 * O modelo vigente da carteirinha em PDF, com um membro de mentira: para a
 * igreja ver como fica impresso antes de emitir. Não toca em dado de membro.
 */
export async function GET() {
  const [actor, secretario] = await Promise.all([getCarteirinhaActorAutorizado(), getSecretariaActorAutorizado()]);
  if (!actor || !secretario) return new NextResponse("Não encontrado", { status: 404 });

  try {
    const service = await getCarteirinhaService();
    const [{ modelo, logoUrl }, { igreja }] = await Promise.all([
      service.modelo(actor),
      (await getSecretariaService()).paraEmitir(secretario),
    ]);
    const exemplo = carteirinhaDeExemplo({ ...igreja, logoUrl }, modelo, validadePadrao(hojeISO()));
    const pdf = await gerarCarteirinhaPdf({
      carteirinha: exemplo,
      foto: null,
      logo: await service.logo(logoDaCarteirinha(exemplo, modelo)),
      urlVerificacao: `${getServerEnv().APP_URL.replace(/\/+$/, "")}/verificar/${exemplo.codigo}`,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="exemplo-carteirinha.pdf"',
      },
    });
  } catch (err) {
    console.error("[carteirinha] falha ao gerar o exemplo do modelo", err);
    return new NextResponse("Não foi possível gerar o exemplo. Tente novamente.", { status: 500 });
  }
}
