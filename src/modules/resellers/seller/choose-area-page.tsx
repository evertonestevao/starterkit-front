import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Link2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePostLoginPath } from "../areaAccess";

/** Quem é cliente e vendedor escolhe a área depois do login. */
export default async function ChooseAreaPage() {
  const destination = await resolvePostLoginPath();
  if (destination !== "/escolher-area") redirect(destination);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Qual área você quer abrir?</h1>
      <div className="grid w-full max-w-2xl gap-4 md:grid-cols-2">
        <Link href="/dashboard" className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Card className="h-full hover:border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4" aria-hidden />
                Área do cliente
              </CardTitle>
              <CardDescription>Sua empresa, membros e assinatura</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>
        <Link href="/vendedor" className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Card className="h-full hover:border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-4" aria-hidden />
                Área do vendedor
              </CardTitle>
              <CardDescription>Seu link, clientes e comissões</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>
      </div>
    </div>
  );
}
