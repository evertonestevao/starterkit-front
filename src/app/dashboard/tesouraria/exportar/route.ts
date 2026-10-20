import { NextResponse, type NextRequest } from "next/server";
import { hojeISO } from "@/lib/acompanhamento";
import { filtrarLancamentos, lancamentosParaCsv, lerFiltros } from "@/lib/tesouraria";
import { recordAudit } from "@/server/audit";
import { getMenusVisiveis } from "@/server/menuPermissoes";
import { getTesourariaActorAutorizado, getTesourariaService } from "@/server/tesouraria";

/**
 * Planilha dos lançamentos: ?mes=AAAA-MM&tipo=&forma=&q= (os mesmos filtros
 * da tela).
 *
 * Route handler não passa pelo layout da Tesouraria, então a guarda é
 * repetida aqui: sem o menu, 404. Leva nome de dizimista e valor — toda
 * exportação é registrada na auditoria.
 */
export async function GET(request: NextRequest) {
  const actor = await getTesourariaActorAutorizado();
  if (!actor || !(await getMenusVisiveis()).includes("tesouraria")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const filtros = lerFiltros(
    { mes: sp.get("mes"), tipo: sp.get("tipo"), forma: sp.get("forma"), q: sp.get("q") },
    hojeISO(),
  );

  try {
    const { lancamentos } = await (await getTesourariaService()).doMes(actor, filtros.mes);
    const filtrados = filtrarLancamentos(lancamentos, filtros);

    await recordAudit({
      companyId: actor.companyId,
      action: "tesouraria.exportada",
      entityType: "tesouraria_lancamento",
      metadata: { mes: filtros.mes, tipo: filtros.tipo, forma: filtros.forma, quantidade: filtrados.length },
    });

    return new NextResponse(lancamentosParaCsv(filtrados), {
      headers: {
        // Dado pessoal e financeiro: nada de cache compartilhado.
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tesouraria-${filtros.mes}.csv"`,
      },
    });
  } catch (err) {
    console.error("[tesouraria] falha ao exportar", err);
    return new NextResponse("Não foi possível gerar o arquivo. Tente novamente.", { status: 500 });
  }
}
