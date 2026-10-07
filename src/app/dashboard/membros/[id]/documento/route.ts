import { NextResponse, type NextRequest } from "next/server";
import { hojeISO } from "@/lib/acompanhamento";
import { isAppError } from "@/lib/errors";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { gerarDocumentoPdf } from "@/server/documentoMembroPdf";
import { getMenusVisiveis } from "@/server/menuPermissoes";
import { getSecretariaActorAutorizado, getSecretariaService } from "@/server/secretaria";

/**
 * Emite um documento do membro em PDF: ?tipo=declaracao|recomendacao|transferencia&destino=.
 *
 * Route handler não passa pelo layout de Membros, então a guarda é repetida
 * aqui: sem o menu Membros, 404. Os dados do membro são lidos com a permissão
 * de quem pede (a RLS só devolve membro da própria igreja) e cada emissão fica
 * no histórico dele.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, leitor] = await Promise.all([getSecretariaActorAutorizado(), getAcompanhamentoActorAutorizado()]);
  if (!actor || !leitor || !(await getMenusVisiveis()).includes("membros")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    const acompanhamento = await getAcompanhamentoService();
    const [{ membro }, ficha] = await Promise.all([
      acompanhamento.getMembro(leitor, id),
      acompanhamento.getFicha(leitor, id),
    ]);

    const documento = await (
      await getSecretariaService()
    ).emitir(
      actor,
      membro.id,
      {
        nome: membro.nome,
        sexo: ficha.sexo,
        nascimento: membro.nascimento,
        estadoCivil: ficha.estadoCivil,
        batismo: membro.batismo,
        membroDesde: ficha.membroDesde,
        cargos: membro.cargos.map((c) => c.nome),
      },
      { tipo: sp.get("tipo"), destino: sp.get("destino") },
    );

    const pdf = await gerarDocumentoPdf(documento);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        // Dado pessoal: nada de cache compartilhado.
        "Cache-Control": "private, no-store",
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${documento.tipo}-${hojeISO()}.pdf"`,
      },
    });
  } catch (err) {
    if (isAppError(err) && (err.code === "not_found" || err.code === "forbidden")) {
      return new NextResponse("Não encontrado", { status: 404 });
    }
    if (isAppError(err) && err.code === "validation_error") {
      return new NextResponse(err.message, { status: 400 });
    }
    console.error("[secretaria] falha ao emitir documento", err);
    return new NextResponse("Não foi possível gerar o documento. Tente novamente.", { status: 500 });
  }
}
