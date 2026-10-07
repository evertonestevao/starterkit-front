import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CircleAlert } from "lucide-react";
import { brand } from "@/config/brand";
import { formatarData } from "@/lib/acompanhamento";
import { ESTADO_CARTEIRINHA_TEXTO } from "@/lib/carteirinha";
import { formatChurchName } from "@/lib/churchName";
import { getCarteirinhaService } from "@/server/carteirinha";

export const metadata: Metadata = {
  title: "Verificar carteirinha",
  robots: { index: false, follow: false },
};

/**
 * Para onde o QR Code da carteirinha leva. Mostra o MÍNIMO: nome, igreja e se
 * está válida. Carteirinha cancelada ou de quem não está mais ativo não mostra
 * nem o nome — o consentimento pode ter sido retirado.
 */
export default async function VerificarCarteirinhaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const v = await (await getCarteirinhaService()).verificar(codigo);
  const valida = v?.estado === "valida";

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8 text-xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
        {valida ? (
          <BadgeCheck className="mx-auto size-12 text-emerald-600" aria-hidden />
        ) : (
          <CircleAlert className="mx-auto size-12 text-destructive" aria-hidden />
        )}
        <h1 className="mt-3 text-lg font-semibold">
          {!v ? "Carteirinha não encontrada" : valida ? "Carteirinha válida" : "Carteirinha sem validade"}
        </h1>

        {!v ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Este código não corresponde a nenhuma carteirinha. Confira se o QR Code foi lido por inteiro.
          </p>
        ) : (
          <>
            {v.nome ? <p className="mt-4 text-xl font-semibold break-words">{v.nome}</p> : null}
            <p className="mt-1 text-sm text-muted-foreground">
              {v.nome ? "Membro de " : ""}
              {formatChurchName(v.igreja, v.igrejaSobrenome)}
            </p>
            {v.validade ? (
              <p className="mt-3 text-sm">
                Validade: <span className="font-medium">{formatarData(v.validade)}</span>
              </p>
            ) : null}
            {!valida ? (
              <p className="mt-3 text-sm text-muted-foreground">{ESTADO_CARTEIRINHA_TEXTO[v.estado]}</p>
            ) : null}
          </>
        )}
      </div>
      <p className="mt-4 max-w-sm text-center text-xs text-muted-foreground">
        Verificação feita agora, direto no cadastro da igreja.
      </p>
    </div>
  );
}
