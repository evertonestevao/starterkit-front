import type { Instrumentation } from "next";

/**
 * Erros que escapam de render, route handlers e actions chegam aqui e vão ao
 * reporter ativo (src/adapters/errorReporting). Só no runtime Node: o reporter
 * lê env de servidor.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("@/adapters/errorReporting");
  await reportError(err, {
    source: context.routeType,
    // Só método e path: headers podem carregar cookie de sessão.
    extra: { method: request.method, path: request.path, route: context.routePath },
  });
};
