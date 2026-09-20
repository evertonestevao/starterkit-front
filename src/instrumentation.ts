/**
 * Roda uma vez, quando o servidor sobe (Next `instrumentation`).
 *
 * Só avisos de configuração: nada aqui pode derrubar o boot.
 */
export async function register() {
  if (process.env.NODE_ENV !== "production") return;

  if (process.env.RATE_LIMIT_STORE !== "redis") {
    // Em serverless cada instância tem o próprio contador de memória, então o
    // rate limit do login e da recuperação de senha vira quase decorativo — e
    // a contagem de visitas passa a repetir a mesma pessoa a cada instância.
    console.warn(
      "[boot] RATE_LIMIT_STORE não é 'redis' em produção: o rate limit vale por instância e protege pouco. " +
        "Configure RATE_LIMIT_STORE=redis com UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN.",
    );
  }
}
