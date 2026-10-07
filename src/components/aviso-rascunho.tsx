"use client";

import { CloudOff, History } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Avisos da chamada com internet ruim, logo acima da lista:
 *  - "pendente": o envio falhou, os dados estão no aparelho e serão reenviados;
 *  - "encontrado": há uma chamada não enviada de uma visita anterior a esta tela.
 */
export function AvisoRascunho({
  pendente,
  enviando,
  encontradoEm,
  encontradoPendente,
  aoTentar,
  aoRecuperar,
  aoDescartar,
}: {
  pendente: boolean;
  enviando: boolean;
  /** Hora do rascunho antigo (ms), ou null se não há. */
  encontradoEm: number | null;
  encontradoPendente: boolean;
  aoTentar: () => void;
  aoRecuperar: () => void;
  aoDescartar: () => void;
}) {
  if (pendente) {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-start gap-2">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>Sem conexão.</strong> A chamada está guardada neste aparelho e será enviada sozinha quando a internet
            voltar. Não feche esta tela.
          </span>
        </p>
        <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={aoTentar} className="shrink-0">
          {enviando ? "Enviando..." : "Tentar de novo"}
        </Button>
      </div>
    );
  }

  if (encontradoEm !== null) {
    const quando = new Date(encontradoEm).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-lg border border-sky-600/50 bg-sky-600/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-start gap-2">
          <History className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>Há uma chamada não enviada neste aparelho</strong>, de {quando}
            {encontradoPendente ? " (ficou sem conexão na hora de salvar)" : ""}. Quer continuar de onde parou?
          </span>
        </p>
        <span className="flex shrink-0 gap-2">
          <Button type="button" size="sm" onClick={aoRecuperar}>
            Recuperar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={aoDescartar}>
            Descartar
          </Button>
        </span>
      </div>
    );
  }

  return null;
}
