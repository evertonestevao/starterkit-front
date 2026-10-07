import type { Metadata } from "next";
import Link from "next/link";
import { Download, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { getServerEnv } from "@/config/env";
import { CarteirinhaVisual } from "@/features/carteirinha/components/carteirinha-visual";
import { ESTADO_CARTEIRINHA_TEXTO } from "@/lib/carteirinha";
import { qrSvg } from "@/lib/qr";
import { cn } from "@/lib/utils";
import { getCarteirinhaService } from "@/server/carteirinha";

export const metadata: Metadata = {
  title: "Carteirinha de membro",
  // O caminho carrega o link pessoal do membro.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * A carteirinha do membro, pelo link pessoal que a secretaria enviou. Sem
 * login: o link é a credencial. Link trocado ou carteirinha cancelada não
 * abrem nada.
 */
export default async function CarteirinhaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const carteirinha = await (await getCarteirinhaService()).porToken(token);

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8">
      <Link href="/" className="mb-6 text-xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <div className="flex w-full max-w-sm flex-col gap-4">
        {!carteirinha ? (
          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              Este link de carteirinha não vale mais. Peça um novo à secretaria da sua igreja.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <CarteirinhaVisual
              carteirinha={carteirinha}
              fotoUrl={carteirinha.temFoto ? `/carteirinha/${token}/foto` : null}
              qrSvg={await qrSvg(`${getServerEnv().APP_URL.replace(/\/+$/, "")}/verificar/${carteirinha.codigo}`, 240)}
            />
            {carteirinha.estado !== "valida" ? (
              <Alert>
                <Info className="size-4" />
                <AlertDescription>{ESTADO_CARTEIRINHA_TEXTO[carteirinha.estado]}</AlertDescription>
              </Alert>
            ) : null}
            <a
              href={`/carteirinha/${token}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "gap-2")}
            >
              <Download className="size-4" /> Baixar para imprimir (PDF)
            </a>
            <p className="text-center text-xs text-muted-foreground">
              Este endereço é só seu: quem tiver o link vê a sua carteirinha. Guarde-o nos favoritos ou na tela inicial
              do celular. Se ele cair em mãos erradas, peça à secretaria um link novo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
