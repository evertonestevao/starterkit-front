import { formatarData } from "@/lib/acompanhamento";
import { ESTADO_CARTEIRINHA_LABEL, codigoEmBlocos } from "@/lib/carteirinha";
import { formatChurchName } from "@/lib/churchName";
import { cn } from "@/lib/utils";
import type { Carteirinha } from "@/types/carteirinha";

/**
 * A carteirinha na tela: frente (igreja, foto, nome, cargos) e, abaixo, o QR
 * Code com a validade. `qrSvg` vem pronto do servidor (gerado pela lib de QR
 * a partir do nosso próprio endereço de verificação).
 */
export function CarteirinhaVisual({
  carteirinha: c,
  fotoUrl,
  qrSvg,
}: {
  carteirinha: Carteirinha;
  /** Endereço da foto, ou null se não há foto. */
  fotoUrl: string | null;
  qrSvg: string;
}) {
  const valida = c.estado === "valida";
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground">
        {formatChurchName(c.igreja, c.igrejaSobrenome)}
      </div>

      <div className="flex gap-4 p-4">
        <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-xs text-muted-foreground">
          {fotoUrl ? (
            // Imagem servida por um handler nosso, com checagem de acesso: o otimizador do Next não se aplica.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoUrl} alt={`Foto de ${c.nome}`} className="size-full object-cover" />
          ) : (
            "sem foto"
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">Membro</p>
          <p className="text-lg leading-tight font-semibold break-words">{c.nome}</p>
          {c.cargos ? <p className="mt-1 text-sm text-muted-foreground">{c.cargos}</p> : null}
          {c.membroDesde ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Membro desde <span className="font-medium text-foreground">{formatarData(c.membroDesde)}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-4 border-t p-4">
        <div
          className="size-28 shrink-0 rounded-md bg-white p-1 [&>svg]:size-full"
          role="img"
          aria-label="QR Code de verificação da carteirinha"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="min-w-0 text-sm">
          <p className="text-[0.65rem] font-medium tracking-wide text-muted-foreground uppercase">Validade</p>
          <p className="font-semibold">{formatarData(c.validade)}</p>
          <p
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
              valida
                ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300"
                : "bg-destructive/15 text-destructive",
            )}
          >
            {ESTADO_CARTEIRINHA_LABEL[c.estado]}
          </p>
          <p className="mt-2 font-mono text-[0.7rem] text-muted-foreground">{codigoEmBlocos(c.codigo)}</p>
          {c.pastor ? <p className="mt-1 text-xs text-muted-foreground">Pastor: {c.pastor}</p> : null}
        </div>
      </div>
    </div>
  );
}
