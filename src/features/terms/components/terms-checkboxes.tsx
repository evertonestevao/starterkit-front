"use client";

import Link from "next/link";

/**
 * Checkboxes de aceite (obrigatório) e consentimento de email (opcional,
 * separado — LGPD). Nativos: funcionam sem JS e postam "on" no FormData.
 * Reutilizados no onboarding e na página de reaceite.
 */
export function TermsCheckboxes() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="accept_terms" required className="mt-0.5 size-4 accent-primary" />
        <span>
          Li e aceito os{" "}
          <Link
            href="/terms"
            target="_blank"
            className="text-foreground underline underline-offset-4"
          >
            Termos de Uso e a Política de Privacidade
          </Link>{" "}
          <span className="text-destructive" aria-hidden>
            *
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-muted-foreground">
        <input type="checkbox" name="email_consent" className="mt-0.5 size-4 accent-primary" />
        <span>Aceito receber comunicações por email (opcional — pode revogar depois)</span>
      </label>
    </div>
  );
}
