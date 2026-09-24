"use client";

import { Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

/**
 * Miniatura do logo no perfil do patrocinador, com o estado da moderação.
 *
 * O logo já enviado aparece mesmo sem aprovação — a pessoa precisa ver que o
 * envio funcionou —, e o selo diz em que pé está: atenção enquanto espera a
 * conferência, check verde quando já está no ar. Clicar explica em uma frase
 * (toast, e não tooltip: no celular não existe hover).
 *
 * O arquivo recém-escolhido (ainda nem clicou em Salvar) tem prioridade sobre
 * os dois: sem isso, escolher um arquivo novo não muda nada na tela até o
 * formulário ser enviado e a página recarregar — parece que não funcionou.
 */
export function SponsorLogoPreview({
  logoUrl,
  pendingLogoUrl,
  selectedFileUrl,
}: {
  /** O logo aprovado, o que as igrejas exibem hoje. */
  logoUrl: string | null;
  /** O logo enviado que espera conferência. Tem prioridade sobre o aprovado. */
  pendingLogoUrl: string | null;
  /** Arquivo escolhido agora no input, antes de Salvar. Máxima prioridade. */
  selectedFileUrl: string | null;
}) {
  const aguardando = pendingLogoUrl !== null;
  const imagem = selectedFileUrl ?? pendingLogoUrl ?? logoUrl;

  if (!imagem) {
    return (
      <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
        sem logo
      </span>
    );
  }

  if (selectedFileUrl) {
    const explicacao = "Arquivo escolhido, ainda não enviado. Clique em Salvar para mandar para conferência.";
    return (
      <button
        type="button"
        onClick={() => toast.info(explicacao)}
        aria-label="Arquivo escolhido, ainda não enviado. Toque para saber mais."
        className="relative size-14 shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pré-visualização local, nunca sobe sozinha */}
        <img
          src={selectedFileUrl}
          alt=""
          className="size-full rounded-lg border border-dashed border-muted-foreground/60 bg-white object-contain"
        />
      </button>
    );
  }

  const explicacao = aguardando
    ? logoUrl
      ? "Logo aguardando aprovação. Até a conferência, as igrejas seguem exibindo o logo anterior."
      : "Logo aguardando aprovação. Assim que a equipe conferir, ele aparece nas páginas das igrejas."
    : "Logo aprovado: é este que aparece nas páginas das igrejas.";

  return (
    <button
      type="button"
      onClick={() => (aguardando ? toast.warning(explicacao) : toast.success(explicacao))}
      aria-label={aguardando ? "Logo aguardando aprovação. Toque para saber mais." : "Logo aprovado. Toque para saber mais."}
      className="relative size-14 shrink-0 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- logo em storage externo */}
      <img
        src={imagem}
        alt=""
        className={
          aguardando
            ? "size-full rounded-lg border border-amber-500/60 bg-white object-contain"
            : "size-full rounded-lg border bg-white object-contain"
        }
      />
      <span
        aria-hidden
        className={
          aguardando
            ? "absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white ring-2 ring-background"
            : "absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white ring-2 ring-background"
        }
      >
        {aguardando ? <TriangleAlert className="size-3" /> : <Check className="size-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}
