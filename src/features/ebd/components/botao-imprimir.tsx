"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre a impressão do navegador, de onde se salva em PDF ou se imprime. */
export function BotaoImprimir() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <FileDown className="size-4" /> Salvar em PDF
    </Button>
  );
}
