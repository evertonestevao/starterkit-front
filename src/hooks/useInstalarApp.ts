"use client";

import { useCallback, useSyncExternalStore } from "react";
import { comoInstalar, type ComoInstalar } from "@/lib/instalarApp";

/**
 * Estado de "instalar o app", compartilhado pela tela inteira.
 *
 * O Chrome/Edge avisam que o site pode ser instalado com o evento
 * `beforeinstallprompt`, que chega UMA vez e cedo — muitas vezes antes de o
 * botão de instalar existir na tela. Por isso o evento é guardado aqui, fora
 * dos componentes, e quem precisa lê pelo `useSyncExternalStore`.
 */

interface EventoDeInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let eventoGuardado: EventoDeInstalar | null = null;
let instalou = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Sem isto, o Chrome mostra a própria faixa de instalar na hora errada.
    e.preventDefault();
    eventoGuardado = e as EventoDeInstalar;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    instalou = true;
    eventoGuardado = null;
    avisar();
  });
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

function situacaoAtual(): ComoInstalar {
  if (instalou) return "ja_instalado";
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return comoInstalar(
    {
      userAgent: nav.userAgent,
      aberturaComoApp: window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true,
      temJanelaDeInstalar: eventoGuardado !== null,
    },
    nav.maxTouchPoints > 1,
  );
}

/** No servidor não há navegador: nada a oferecer. */
const situacaoNoServidor = (): ComoInstalar => "indisponivel";

export function useInstalarApp(): { modo: ComoInstalar; abrirJanela: () => Promise<boolean> } {
  const modo = useSyncExternalStore(assinar, situacaoAtual, situacaoNoServidor);

  /** Abre a janela de instalar do navegador. Devolve true se a pessoa aceitou. */
  const abrirJanela = useCallback(async () => {
    const evento = eventoGuardado;
    if (!evento) return false;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    // O evento só serve uma vez, aceitando ou não.
    eventoGuardado = null;
    avisar();
    return outcome === "accepted";
  }, []);

  return { modo, abrirJanela };
}
