import "server-only";
import { getServerEnv, requireServerEnv } from "@/config/env";
import { createConsoleProvider } from "./consoleProvider";
import type { EmailProvider } from "./EmailProvider";
import { createResendProvider } from "./resendProvider";

export type { EmailMessage, EmailProvider } from "./EmailProvider";

/** Factory do provider ativo, escolhido por EMAIL_PROVIDER (env de servidor). */
export function getEmailProvider(): EmailProvider {
  switch (getServerEnv().EMAIL_PROVIDER) {
    case "resend":
      return createResendProvider({
        apiKey: requireServerEnv("RESEND_API_KEY"),
        from: requireServerEnv("EMAIL_FROM"),
      });
    case "console":
      return createConsoleProvider();
  }
}
