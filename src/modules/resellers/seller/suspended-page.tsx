import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/server/actions/auth";
import { getResellerRoles, hasCompany } from "../areaAccess";

/** Explica o bloqueio a quem foi suspenso, em vez de só tirar a pessoa da área. */
export default async function SuspendedPage() {
  const { isSuspended } = await getResellerRoles();
  if (!isSuspended) redirect("/dashboard");
  const withCompany = await hasCompany();

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Seu acesso de vendedor está suspenso</CardTitle>
          <CardDescription>
            Fale com o administrador para saber mais. Suas comissões já registradas continuam preservadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {withCompany ? (
            <Link href="/dashboard" className={buttonVariants()}>
              Ir para a área do cliente
            </Link>
          ) : null}
          <form action={signOutAction}>
            <button type="submit" className={buttonVariants({ variant: "outline" })}>
              Sair
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
