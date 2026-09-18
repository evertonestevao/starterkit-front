import { FlaskConical } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Rótulo de tela que ainda é maquete.
 *
 * Fica no topo, antes de qualquer número: um pastor que abre a tela e vê
 * gráficos sobre a própria igreja não tem como saber que foram inventados. A
 * mesma frase em todas as telas nessa situação — descobrir depois que o
 * relatório era fictício custa muito mais caro que o aviso.
 */
export function PreviewNotice({ children }: { children: React.ReactNode }) {
  return (
    <Alert>
      <FlaskConical className="size-4" />
      <AlertDescription>
        <strong className="font-medium text-foreground">Tela de demonstração.</strong> {children}
      </AlertDescription>
    </Alert>
  );
}
