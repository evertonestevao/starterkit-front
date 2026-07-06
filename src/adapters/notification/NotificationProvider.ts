/**
 * Interface única de notificações fora do app (WhatsApp, SMS, push...),
 * no mesmo padrão de EmailProvider/PaymentGateway: services só conhecem
 * esta interface; cada provedor vira um adapter nesta pasta.
 *
 * COMO PLUGAR UM PROVEDOR NOVO (ex.: Evolution API para WhatsApp):
 *  1. Crie `evolutionProvider.ts` aqui implementando NotificationProvider
 *     (via fetch REST, sem SDK — padrão do projeto).
 *  2. Adicione o case na factory `getNotificationProvider` (index.ts) e a
 *     opção no enum NOTIFICATION_PROVIDER em src/config/env.ts.
 *  3. Documente as env vars novas no .env.example.
 *  Nenhum service precisa mudar.
 */

export type NotificationChannel = "whatsapp" | "sms" | "push";

export interface NotificationMessage {
  /** Destinatário no formato do canal (E.164 para whatsapp/sms, token para push). */
  to: string;
  channel: NotificationChannel;
  /** Texto principal. Provedores com template podem mapear em cima disso. */
  body: string;
  /** Título/assunto, quando o canal suporta (push). */
  title?: string;
  /** Dados extras específicos do provedor (ex.: template id). NUNCA logar cru. */
  metadata?: Record<string, unknown>;
}

export interface NotificationProvider {
  readonly name: string;
  /** Envia a notificação. Falha vira AppError("internal_error"). */
  send(message: NotificationMessage): Promise<void>;
}
