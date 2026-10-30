import { reportError } from "@/adapters/errorReporting";
import { isAppError, toPublicError } from "@/lib/errors";
import { getAccountService } from "@/server/account";

/**
 * Portabilidade (LGPD, art. 18, V): baixa os dados pessoais do usuário logado
 * em JSON. Sem sessão, o service responde unauthorized.
 */
export async function GET() {
  try {
    const account = await getAccountService();
    const data = await account.exportMyData();
    const date = data.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="meus-dados-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // Erro esperado (sessão, rate limit) não vai ao monitoramento; falha interna, sim.
    if (!isAppError(err) || err.status >= 500) {
      await reportError(err, { source: "route:/api/account/export" });
    }
    return Response.json(
      { error: toPublicError(err) },
      { status: isAppError(err) ? err.status : 500 },
    );
  }
}
