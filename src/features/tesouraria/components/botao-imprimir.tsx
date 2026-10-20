"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Imprime a página (ou salva em PDF pelo próprio navegador). */
export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
      <Printer className="size-4" /> Imprimir
    </Button>
  );
}
