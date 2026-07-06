import "server-only";
import { getServerEnv } from "@/config/env";
import { createConsoleNotificationProvider } from "./consoleProvider";
import type { NotificationProvider } from "./NotificationProvider";

export type {
  NotificationChannel,
  NotificationMessage,
  NotificationProvider,
} from "./NotificationProvider";

/** Factory do provider ativo, escolhido por NOTIFICATION_PROVIDER (env). */
export function getNotificationProvider(): NotificationProvider {
  switch (getServerEnv().NOTIFICATION_PROVIDER) {
    case "console":
      return createConsoleNotificationProvider();
  }
}
