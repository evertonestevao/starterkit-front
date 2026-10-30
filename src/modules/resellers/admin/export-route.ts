import "server-only";
import type { NextRequest } from "next/server";
import { reportError } from "@/adapters/errorReporting";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createResellerAdminRepository } from "../adminRepository";
import { getResellerRoles } from "../areaAccess";
import { buildCommissionsCsv, withDefaultPeriod } from "../commissionCsv";
import { commissionFiltersSchema } from "../schemas";

const EXPORT_LIMIT = 10_000;

/** GET do CSV. Rota não herda a proteção do layout: revalida o papel aqui. */
export async function exportCommissions(request: NextRequest): Promise<Response> {
  try {
    const { isSuperAdmin } = await getResellerRoles();
    if (!isSuperAdmin) {
      return Response.json({ error: "Acesso negado" }, { status: 403 });
    }

    const filters = withDefaultPeriod(
      commissionFiltersSchema.parse(Object.fromEntries(request.nextUrl.searchParams)),
    );
    const repo = createResellerAdminRepository(await getSupabaseServerClient());
    const csv = buildCommissionsCsv(await repo.listCommissions(filters, EXPORT_LIMIT));

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="comissoes-${filters.from ?? "inicio"}-a-${filters.to ?? "hoje"}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    await reportError(err, { source: "route:/admin/revendedores/lancamentos/exportar" });
    return Response.json({ error: "Não foi possível exportar" }, { status: 500 });
  }
}
