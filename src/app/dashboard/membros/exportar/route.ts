import { NextResponse, type NextRequest } from "next/server";
import { hojeISO } from "@/lib/acompanhamento";
import { FILTRO_SITUACAO_LABEL, lerFiltroQuadro, lerFiltroSituacao, membrosParaCsv } from "@/lib/rolMembros";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { recordAudit } from "@/server/audit";
import { gerarRolPdf } from "@/server/membrosRolPdf";
import { getMenusVisiveis } from "@/server/menuPermissoes";

/**
 * Exporta o rol de membros: ?formato=csv|pdf&situacao=&quadro=&cargo=.
 *
 * Route handler não passa pelo layout de Membros, então a guarda é repetida
 * aqui: sem o menu Membros, 404. A planilha leva a ficha completa; como a RLS
 * das fichas só responde para quem tem o módulo, e este handler já exige o
 * menu, as duas travas coincidem. Toda exportação é registrada na auditoria.
 */
export async function GET(request: NextRequest) {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor || !(await getMenusVisiveis()).includes("membros")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const formato = sp.get("formato") === "pdf" ? "pdf" : "csv";
  const situacao = lerFiltroSituacao(sp.get("situacao"));
  const quadro = lerFiltroQuadro(sp.get("quadro"));
  const cargoId = sp.get("cargo") ?? undefined;
  const hoje = hojeISO();

  try {
    const service = await getAcompanhamentoService();
    const { igreja, membros, fichas, cortado } = await service.exportarMembros(actor, {
      situacao,
      quadro,
      cargoId,
      comFichas: formato === "csv",
    });

    await recordAudit({
      companyId: actor.companyId,
      action: "membros.exportados",
      entityType: "rol_membro",
      metadata: { formato, situacao, quadro, cargo: cargoId ?? null, quantidade: membros.length },
    });

    const cabecalhos = {
      // Dado pessoal: nada de cache compartilhado.
      "Cache-Control": "private, no-store",
      ...(cortado ? { "X-Exportacao-Cortada": "1" } : {}),
    };

    if (formato === "pdf") {
      const cargoNome = cargoId ? membros[0]?.cargos.find((c) => c.id === cargoId)?.nome : null;
      const filtros = [
        FILTRO_SITUACAO_LABEL[situacao],
        quadro === "membros" ? "só do quadro de membros" : quadro === "nao_membros" ? "só não membros" : null,
        cargoNome ? `cargo ${cargoNome}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const pdf = await gerarRolPdf({ igreja, filtros, emitidoEm: hoje, membros });
      return new NextResponse(Buffer.from(pdf), {
        headers: {
          ...cabecalhos,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="membros-${hoje}.pdf"`,
        },
      });
    }

    return new NextResponse(membrosParaCsv(membros, fichas, true), {
      headers: {
        ...cabecalhos,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="membros-${hoje}.csv"`,
      },
    });
  } catch (err) {
    console.error("[membros] falha ao exportar o rol", err);
    return new NextResponse("Não foi possível gerar o arquivo. Tente novamente.", { status: 500 });
  }
}
