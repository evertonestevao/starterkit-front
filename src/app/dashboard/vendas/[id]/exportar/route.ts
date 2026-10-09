import { NextResponse } from "next/server";
import { isAppError } from "@/lib/errors";
import { pedidosParaAbas, pedidosParaCsv } from "@/lib/vendas";
import { gerarXlsx } from "@/lib/xlsx";
import { recordAudit } from "@/server/audit";
import { getMenusVisiveis } from "@/server/menuPermissoes";
import { getVendasActorAutorizado, getVendasService } from "@/server/vendas";

/**
 * Planilha dos pedidos de uma venda: uma linha por pedido, uma coluna por
 * opção e o total de cada no fim. `?formato=xlsx` = Excel (com abas e R$
 * formatado); sem nada, CSV.
 *
 * Route handler não passa pelo layout de Vendas, então a guarda é repetida
 * aqui: sem o menu, 404. Leva nome e WhatsApp de quem comprou — toda
 * exportação é registrada na auditoria.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getVendasActorAutorizado();
  if (!actor || !(await getMenusVisiveis()).includes("vendas")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  const { id } = await params;
  const excel = new URL(request.url).searchParams.get("formato") === "xlsx";

  try {
    const { venda, pedidos } = await (await getVendasService()).detalhe(actor, id);

    await recordAudit({
      companyId: actor.companyId,
      action: "venda.pedidos_exportados",
      entityType: "venda",
      entityId: venda.id,
      metadata: { titulo: venda.titulo, quantidade: pedidos.length, formato: excel ? "xlsx" : "csv" },
    });

    // Nome do arquivo só com letras simples: o título é digitado por quem cria a venda.
    const nome = venda.titulo
      .normalize("NFD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 50);

    if (excel) {
      return new NextResponse(Buffer.from(gerarXlsx(pedidosParaAbas(venda, pedidos))), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="pedidos-${nome || "venda"}.xlsx"`,
        },
      });
    }

    return new NextResponse(pedidosParaCsv(venda, pedidos), {
      headers: {
        // Dado pessoal: nada de cache compartilhado.
        "Cache-Control": "private, no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pedidos-${nome || "venda"}.csv"`,
      },
    });
  } catch (err) {
    if (isAppError(err) && err.code === "not_found") return new NextResponse("Não encontrado", { status: 404 });
    console.error("[vendas] falha ao exportar", err);
    return new NextResponse("Não foi possível gerar o arquivo. Tente novamente.", { status: 500 });
  }
}
