import { NextResponse, type NextRequest } from "next/server";
import { isAppError } from "@/lib/errors";
import { gerarDocumentoPdf } from "@/server/documentoMembroPdf";
import { getSecretariaActorAutorizado, getSecretariaService } from "@/server/secretaria";

/**
 * O modelo vigente de um documento, preenchido com um membro de mentira:
 * ?tipo=. Serve para a igreja ver como o texto dela fica impresso. Não toca
 * em dado de membro nem registra nada.
 */
export async function GET(request: NextRequest) {
  const actor = await getSecretariaActorAutorizado();
  if (!actor) return new NextResponse("Não encontrado", { status: 404 });

  try {
    const documento = await (await getSecretariaService()).exemplo(actor, request.nextUrl.searchParams.get("tipo"));
    const pdf = await gerarDocumentoPdf(documento);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="exemplo-${documento.tipo}.pdf"`,
      },
    });
  } catch (err) {
    if (isAppError(err) && err.code === "validation_error") return new NextResponse(err.message, { status: 400 });
    console.error("[secretaria] falha ao gerar o exemplo", err);
    return new NextResponse("Não foi possível gerar o exemplo. Tente novamente.", { status: 500 });
  }
}
