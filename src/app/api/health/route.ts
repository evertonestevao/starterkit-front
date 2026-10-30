import { getHealthService } from "@/server/health";

/**
 * GET /api/health — 200 se tudo responde, 503 se algo falhou. Público e sem
 * sessão; não expõe versão, erro ou detalhe interno.
 */
export async function GET() {
  const report = await getHealthService().run();
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
