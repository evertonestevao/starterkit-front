/**
 * Interface única de envio de email transacional. Cada provedor (Resend,
 * SES, Postmark...) implementa em src/adapters/email — services nunca chamam
 * SDK/API de provedor direto.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
