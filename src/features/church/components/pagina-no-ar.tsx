"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Rocket } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Button, buttonVariants } from "@/components/ui/button";
import { definirPaginaAtivaAction } from "@/server/actions/churchProfile";

/**
 * Liga e desliga a página pública da igreja. Igreja nova nasce com a página
 * fora do ar: quem administra publica quando os dados estiverem prontos.
 * `paginaUrl` é o endereço para ver a página (em prévia, enquanto fora do ar).
 */
export function PaginaNoAr({
  churchId,
  ativa,
  paginaUrl,
}: {
  churchId: string;
  ativa: boolean;
  paginaUrl: string;
}) {
  const [pending, start] = useTransition();

  function mudar(novo: boolean) {
    start(async () => {
      const r = await definirPaginaAtivaAction(churchId, novo);
      if (r.error) toast.error(r.error);
      if (r.success) toast.success(r.success);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ativa ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={async () => {
            const sim = await confirmar({
              titulo: "Tirar a página do ar?",
              descricao:
                "Quem abrir o link, o QR Code ou a tag vai ver que a página não está disponível, e os formulários param de receber pedidos. Você pode publicar de novo quando quiser.",
              botao: "Tirar do ar",
              perigo: true,
            });
            if (sim) mudar(false);
          }}
        >
          <EyeOff className="size-3.5" /> Tirar do ar
        </Button>
      ) : (
        <Button type="button" size="sm" disabled={pending} onClick={() => mudar(true)}>
          <Rocket className="size-3.5" /> {pending ? "Publicando..." : "Colocar a página no ar"}
        </Button>
      )}
      <a href={paginaUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <Eye className="size-3.5" /> {ativa ? "Ver a página" : "Ver a prévia"}
      </a>
    </div>
  );
}
