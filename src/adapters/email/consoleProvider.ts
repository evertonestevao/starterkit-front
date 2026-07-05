import type { EmailMessage, EmailProvider } from "./EmailProvider";

/**
 * Provider de desenvolvimento: imprime o email no console em vez de enviar.
 * SÓ para ambiente local (é o default de EMAIL_PROVIDER) — o corpo pode
 * conter links com token, que nunca devem ir para logs de produção.
 */
export function createConsoleProvider(): EmailProvider {
  return {
    name: "console",

    async send(message: EmailMessage): Promise<void> {
      console.info(
        `[email:console] to=${message.to} subject="${message.subject}"\n${message.text ?? message.html}`,
      );
    },
  };
}
