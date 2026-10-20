import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/config/env";
import { CarteirinhaModeloEditor } from "@/features/church/components/carteirinha-modelo-editor";
import { hojeISO } from "@/lib/acompanhamento";
import { validadePadrao } from "@/lib/carteirinha";
import { carteirinhaDeExemplo } from "@/lib/carteirinhaModelo";
import { qrSvg } from "@/lib/qr";
import { getCarteirinhaActorAutorizado, getCarteirinhaService } from "@/server/carteirinha";
import { getSecretariaActorAutorizado, getSecretariaService } from "@/server/secretaria";

export const metadata: Metadata = { title: "Modelo da carteirinha" };

/**
 * Modelo da carteirinha de membro. Só a igreja do topo da rede — a sede, ou a
 * igreja independente — e só quem a administra: para as demais a página nem
 * existe (o service e o banco recusam de novo).
 */
export default async function CarteirinhaSettingsPage() {
  const actor = await getCarteirinhaActorAutorizado();
  if (!actor) notFound();

  const { modelo, personalizado, podeEditar, logoUrl } = await (await getCarteirinhaService()).modelo(actor);
  if (!podeEditar) notFound();

  // Nome da igreja e do Pastor, para a prévia parecer a carteirinha de verdade.
  const secretario = await getSecretariaActorAutorizado();
  const igreja = secretario
    ? await (
        await getSecretariaService()
      )
        .paraEmitir(secretario)
        .then((r) => r.igreja)
        .catch(() => null)
    : null;
  const exemplo = carteirinhaDeExemplo(
    {
      nome: igreja?.nome ?? "Sua igreja",
      sobrenome: igreja?.sobrenome ?? null,
      pastor: igreja?.pastor ?? null,
      logoUrl,
    },
    modelo,
    validadePadrao(hojeISO()),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modelo da carteirinha</CardTitle>
        <CardDescription>
          Como a carteirinha de membro aparece no celular e impressa. O modelo vale para esta igreja e para todas as que
          estão abaixo dela na rede, inclusive nas carteirinhas já emitidas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CarteirinhaModeloEditor
          // A chave muda quando o modelo gravado muda: o editor recomeça do que está no banco.
          key={JSON.stringify(modelo)}
          inicial={modelo}
          personalizado={personalizado}
          temLogo={logoUrl !== null}
          exemplo={exemplo}
          qrSvg={await qrSvg(`${getServerEnv().APP_URL.replace(/\/+$/, "")}/verificar/${exemplo.codigo}`, 240)}
        />
      </CardContent>
    </Card>
  );
}
