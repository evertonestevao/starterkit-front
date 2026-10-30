"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ link, label }: { link: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={label}>
      <Copy className="size-4" />
      Copiar
    </Button>
  );
}
