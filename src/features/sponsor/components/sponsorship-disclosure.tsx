import Link from "next/link";
import { ChevronDown, HandCoins, Info } from "lucide-react";
import { brand } from "@/config/brand";

/**
 * Para onde vai o dinheiro do patrocínio.
 *
 * Existe porque a leitura natural de "apoie esta igreja" é doação: a pessoa
 * assume que o valor cai na conta da igreja. Não cai — ele custeia a
 * plataforma que mantém a presença digital dela. Deixar isso implícito seria
 * vender uma coisa entregando outra, e o lugar de corrigir é antes do
 * pagamento, não no suporte depois.
 *
 * Colapsado para poupar espaço, mas a FRASE-CHAVE fica na linha fechada: o
 * que economiza espaço é a explicação, nunca o aviso.
 *
 * `<details>` nativo em vez de um acordeão em React: sem JavaScript, sem
 * bundle no client, navegável por teclado de fábrica — e continua abrindo
 * mesmo se a hidratação falhar, que é o caso em que o aviso mais importa.
 */
export function SponsorshipDisclosure({
  churchName,
  churchPublicCode,
}: {
  churchName: string;
  churchPublicCode?: string;
}) {
  return (
    <details className="group rounded-lg border border-dashed">
      <summary className="flex cursor-pointer list-none items-start gap-2 p-3.5 text-xs leading-5 [&::-webkit-details-marker]:hidden">
        <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <strong className="font-medium text-foreground">
            O valor não é repassado para a igreja.
          </strong>{" "}
          <span className="text-muted-foreground group-open:hidden">
            Veja para onde ele vai.
          </span>
        </span>
        <ChevronDown
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="flex flex-col gap-3 border-t px-3.5 py-3 text-xs leading-5 text-muted-foreground">
        <p>
          Ele custeia a plataforma {brand.name}, que mantém no ar a página pública de{" "}
          {churchName}, o QR Code e as ferramentas da comunidade — é o que permite que a igreja
          não pague nada por isso.
        </p>
        <p>
          Em troca, seu nome ou sua marca aparece na página da igreja, para quem chega por ali.
        </p>
        {churchPublicCode ? (
          <p className="flex items-start gap-2">
            <HandCoins className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Quer contribuir{" "}
              <strong className="font-medium text-foreground">para a igreja</strong> com dízimo ou
              oferta? Isso é outra coisa, e fica{" "}
              <Link
                href={`/igreja/${encodeURIComponent(churchPublicCode)}`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                na página dela
              </Link>
              .
            </span>
          </p>
        ) : null}
      </div>
    </details>
  );
}
