"use client";

import { useState } from "react";

/**
 * Copiar texto para a área de transferência, com estado de "copiado" e
 * fallback para fora de contexto seguro.
 *
 * `navigator.clipboard` só existe em HTTPS ou `localhost`. As páginas que
 * usam isto (chave PIX, domínio próprio) são abertas via QR Code — ou seja,
 * testadas no celular acessando o IP da máquina na rede local, em HTTP puro.
 * Nesse caso `navigator.clipboard` é `undefined`, a chamada lança um erro
 * síncrono e, sem fallback, o botão "copia" sem copiar nada.
 *
 * O fallback (`execCommand`) é obsoleto mas ainda amplamente suportado, e é
 * o único caminho de cópia programática que funciona em HTTP.
 */
export function useCopyToClipboard(resetAfterMs = 2000) {
  const [copied, setCopied] = useState(false);

  async function copy(text: string): Promise<boolean> {
    const ok = await copyViaClipboardApi(text).catch(() => false) || copyViaExecCommand(text);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), resetAfterMs);
    return ok;
  }

  return { copied, copy };
}

async function copyViaClipboardApi(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(text);
  return true;
}

function copyViaExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  // Fora da viewport, mas ainda selecionável — alguns navegadores recusam
  // copiar um elemento com display:none ou tamanho zero.
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}
