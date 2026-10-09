"use client";

import { Check, Copy } from "lucide-react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { registerPixCopyAction } from "@/server/actions/churchPixCopy";

/**
 * Chave PIX com botão de copiar. No celular, copiar e colar no app do banco é
 * o caminho inteiro de uma doação — digitar a chave na mão é onde a pessoa
 * erra um dígito ou desiste.
 *
 * A chave também fica visível e selecionável: se o navegador bloquear a área
 * de transferência, ainda dá para copiar segurando o dedo.
 */
export function CopyPix({
  chave,
  churchId,
  copiaECola,
  qrDataUrl,
  rotuloBotao = "Copiar chave PIX",
  rotuloCopiado = "Chave copiada!",
}: {
  chave: string;
  /** Para a métrica de intenção de doar. Sem ele (venda, não doação), nada é registrado. */
  churchId?: string;
  /** BR Code ("copia e cola"): é o que o QR carrega e o que o botão copia. */
  copiaECola?: string | null;
  qrDataUrl?: string | null;
  /** Texto do botão. Com valor embutido, vale dizer isso (a pessoa não digita o valor). */
  rotuloBotao?: string;
  rotuloCopiado?: string;
}) {
  const { copied: copiado, copy } = useCopyToClipboard(2500);

  async function copiar() {
    // Copia o "copia e cola" quando existe: colado no app do banco, ele já
    // abre a doação com o recebedor preenchido. A chave crua é o plano B.
    await copy(copiaECola || chave);
    // Métrica anônima de intenção de doar. Nunca atrapalha a cópia.
    if (churchId) void registerPixCopyAction(churchId).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-3">
      {qrDataUrl ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--pg-border)] bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR Code do PIX desta igreja"
            className="size-44 sm:size-52"
            width={512}
            height={512}
          />
          <p className="text-center text-xs text-neutral-600">
            Aponte a câmera do app do seu banco
          </p>
        </div>
      ) : null}
      <p className="rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface-2)] px-4 py-3 font-mono text-base break-all select-all">
        {chave}
      </p>
      <button
        type="button"
        onClick={copiar}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--pg-accent)] font-semibold text-[var(--pg-accent-fg)]"
      >
        {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        <span aria-live="polite">{copiado ? rotuloCopiado : rotuloBotao}</span>
      </button>
    </div>
  );
}
