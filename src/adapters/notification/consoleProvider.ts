import type { NotificationMessage, NotificationProvider } from "./NotificationProvider";

/**
 * Provider de desenvolvimento: imprime a notificação no terminal em vez de
 * enviar. Único adapter real por enquanto — o objetivo desta camada é o
 * ponto de extensão, não a integração (ver NotificationProvider.ts).
 */
export function createConsoleNotificationProvider(): NotificationProvider {
  return {
    name: "console",

    async send(message: NotificationMessage): Promise<void> {
      console.info(
        `[notification:console] channel=${message.channel} to=${message.to}` +
          `${message.title ? ` title="${message.title}"` : ""}\n${message.body}`,
      );
    },
  };
}
