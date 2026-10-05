/**
 * Roda uma vez, quando o servidor sobe (Next `instrumentation`).
 *
 * Só avisos de configuração: nada aqui pode derrubar o boot.
 */
export async function register() {
  if (process.env.NODE_ENV !== "production") return;

  // E-mail: sem provedor de verdade, convite, link do patrocinador e avisos
  // só aparecem no log do servidor — ninguém recebe nada.
  if (process.env.EMAIL_PROVIDER !== "resend") {
    console.error(
      "[boot] EMAIL_PROVIDER não é 'resend' em produção: NENHUM e-mail é enviado (convites, link de acesso do " +
        "patrocinador, avisos). Configure EMAIL_PROVIDER=resend, RESEND_API_KEY e EMAIL_FROM. Ver docs/email-producao.md.",
    );
  } else if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error(
      "[boot] EMAIL_PROVIDER=resend sem RESEND_API_KEY ou EMAIL_FROM: todo envio de e-mail vai falhar. " +
        "Ver docs/email-producao.md.",
    );
  }

  // Os links dos e-mails usam APP_URL: apontando para localhost, o convite
  // chega mas o link não abre para ninguém.
  if (!process.env.APP_URL || /localhost|127[.]0[.]0[.]1/.test(process.env.APP_URL)) {
    console.error(
      "[boot] APP_URL não está definido para o endereço público em produção: os links dos e-mails (convite, " +
        "acesso do patrocinador) vão apontar para localhost. Defina APP_URL=https://seu-dominio.",
    );
  }

  if (process.env.PUBLIC_FORMS_RELAXED === "true") {
    console.error(
      "[boot] PUBLIC_FORMS_RELAXED=true: a barreira contra robôs e o limite de envios dos formulários públicos " +
        "estão afrouxados. Isso é só para teste automático — remova a variável em produção.",
    );
  }

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
