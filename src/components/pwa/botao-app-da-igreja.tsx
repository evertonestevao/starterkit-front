"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { useInstalarApp } from "@/hooks/useInstalarApp";
import { InstrucoesIos } from "./instalar-app";

/**
 * "Adicionar à tela inicial", no rodapé da página pública da igreja. Discreto
 * de propósito: quem chega quer ver a programação, não instalar nada. Só
 * aparece onde o navegador instala e a página ainda não está instalada.
 */
export function BotaoAppDaIgreja({ nomeDaIgreja }: { nomeDaIgreja: string }) {
  const { modo, abrirJanela } = useInstalarApp();
  const [ios, setIos] = useState(false);
  if (modo !== "botao" && modo !== "instrucoes_ios" && modo !== "abrir_no_safari") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (modo === "botao" ? void abrirJanela() : setIos(true))}
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--pg-border)] px-4 py-2 text-sm font-medium text-[var(--pg-text)] hover:bg-[var(--pg-surface)]"
      >
        <Smartphone className="size-4" aria-hidden />
        Adicionar à tela inicial
      </button>
      <InstrucoesIos
        aberto={ios}
        aoFechar={() => setIos(false)}
        foraDoSafari={modo === "abrir_no_safari"}
        titulo={`Ter ${nomeDaIgreja} na tela inicial`}
      />
    </>
  );
}
