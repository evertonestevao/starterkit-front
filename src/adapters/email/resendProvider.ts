import { AppError } from "@/lib/errors";
import type { EmailMessage, EmailProvider } from "./EmailProvider";

/** Adapter Resend via API REST (fetch) — sem SDK, mesma razão do gateway. */

const RESEND_API = "https://api.resend.com/emails";

interface ResendProviderConfig {
  apiKey: string;
  from: string;
}

export function createResendProvider(config: ResendProviderConfig): EmailProvider {
  return {
    name: "resend",

    async send(message: EmailMessage): Promise<void> {
      const res = await fetch(RESEND_API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });
      if (!res.ok) {
        // Corpo da resposta do provedor vai só para o log interno.
        const detail = await res.json().catch(() => ({ status: res.status }));
        throw new AppError("email_error", "Falha ao enviar email", detail);
      }
    },
  };
}
