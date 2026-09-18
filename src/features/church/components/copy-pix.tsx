"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Chave PIX com botão de copiar. No celular, copiar e colar no app do banco é
 * o caminho inteiro de uma doação — digitar a chave na mão é onde a pessoa
 * erra um dígito ou desiste.
 *
 * A chave também fica visível e selecionável: se o navegador bloquear a área
 * de transferência, ainda dá para copiar segurando o dedo.
 */
export function CopyPix({ chave }: { chave: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência: a chave segue na tela.
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface-2)] px-4 py-3 font-mono text-base break-all select-all">
        {chave}
      </p>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pg-accent)] font-semibold text-[var(--pg-accent-fg)]"
      >
        {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        <span aria-live="polite">{copiado ? "Chave copiada!" : "Copiar chave PIX"}</span>
      </button>
    </div>
  );
}
