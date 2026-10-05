import { NextResponse, type NextRequest } from "next/server";
import { hojeISO } from "@/lib/acompanhamento";
import { domingoSugerido, trimestreDe } from "@/lib/ebd";
import { getEbdActorAutorizado, getEbdService } from "@/server/ebd";
import { gerarRelatorioDomingoPdf } from "@/server/ebdRelatorioPdf";
import { getMenusVisiveis } from "@/server/menuPermissoes";
import { getActiveTenant } from "@/server/tenant";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Relatório do domingo da EBD em PDF, para baixar direto (?data=YYYY-MM-DD).
 *
 * Route handler não passa pelo layout da EBD, então a guarda é repetida
 * aqui: sem o menu da EBD ou sem acesso, 404. O service e a RLS decidem o
 * resto — o professor recebe só as classes dele.
 */
export async function GET(request: NextRequest) {
  const actor = await getEbdActorAutorizado();
  if (!actor || !(await getMenusVisiveis()).includes("ebd")) {
    return new NextResponse("Não encontrado", { status: 404 });
  }

  const pedida = request.nextUrl.searchParams.get("data") ?? "";
  const data = DATA.test(pedida) && !Number.isNaN(Date.parse(pedida)) ? pedida : domingoSugerido(hojeISO());

  try {
    const service = await getEbdService();
    const [{ active }, { classes }, linhas, trimestres] = await Promise.all([
      getActiveTenant(),
      service.classes(actor),
      service.resumoDoDia(actor, data),
      service.trimestres(actor),
    ]);
    const trimestre = trimestreDe(trimestres, data);
    const pdf = await gerarRelatorioDomingoPdf({
      igreja: active?.name ?? "Igreja",
      data,
      trimestre: trimestre ? `${trimestre.nome}${trimestre.revista ? ` (${trimestre.revista})` : ""}` : null,
      linhas,
      professores: Object.fromEntries(classes.map((c) => [c.id, c.professores.map((p) => p.nome).join(", ")])),
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ebd-relatorio-${data}.pdf"`,
        // Dado da igreja: nada de cache compartilhado.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[ebd] falha ao gerar o PDF do domingo", err);
    return new NextResponse("Não foi possível gerar o PDF. Tente novamente.", { status: 500 });
  }
}
