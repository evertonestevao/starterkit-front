import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brand } from "@/config/brand";
import { CreateCompanyForm } from "@/features/companies/components/create-company-form";
import { safeChurchLinkPath, tokenDoCaminho } from "@/lib/churchLinks";
import { formatChurchName } from "@/lib/churchName";
import { cadastroAberto, conviteIgrejaValido } from "@/server/cadastro";
import { getChurchLinkService } from "@/server/churchLinks";
import { isPlatformStaff } from "@/server/platform";
import { getActiveTenant } from "@/server/tenant";
import { getTermsService } from "@/server/terms";

export const metadata: Metadata = { title: "Criar igreja" };

/**
 * Onboarding: caminho crítico signup → aceitar termos → criar empresa →
 * virar owner. Quem já tem empresa não passa por aqui.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; igreja_nova?: string }>;
}) {
  const sp = await searchParams;
  // Quem chegou por um link de vínculo volta a ele depois de cadastrar a igreja.
  const next = safeChurchLinkPath(sp.next);
  const { companies } = await getActiveTenant();
  if (companies.length > 0) {
    redirect(next ?? "/dashboard");
  }

  // Quem modera a plataforma não é uma igreja sem cadastro. O cadastro público
  // leva todo mundo para cá; a moderação segue para a área dela. Para testar
  // como igreja, use outra conta — misturar operador e cliente na mesma
  // identidade embaralha a auditoria dos dois lados.
  if (await isPlatformStaff()) {
    redirect("/plataforma");
  }

  const terms = await getTermsService();
  const requireTerms = !(await terms.hasAcceptedCurrent("igreja"));

  // Chegou por um link de vínculo ainda válido: o cadastro já sugere o nome da
  // igreja que convidou e marca a rede. Link inválido só não sugere nada.
  const token = next ? tokenDoCaminho(next) : null;
  const preview = token ? await (await getChurchLinkService()).previewInvite(token).catch(() => null) : null;
  const convite =
    preview && preview.status === "ativo" && !preview.isMine
      ? { nome: preview.church.name, igreja: formatChurchName(preview.church.name, preview.church.sobrenome) }
      : undefined;

  // Cadastro só por convite (piloto): sem link de vínculo válido nem convite
  // da plataforma, explica em vez de mostrar o formulário. O banco recusa de
  // novo se alguém tentar por fora.
  const igrejaNova = sp.igreja_nova && (await conviteIgrejaValido(sp.igreja_nova)) ? sp.igreja_nova : undefined;
  const liberado = !!convite || !!igrejaNova || (await cadastroAberto());

  if (!liberado) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
          {brand.name}
        </Link>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Cadastro por convite</CardTitle>
            <CardDescription>
              No momento, novas igrejas entram no {brand.name} só por convite. Se a sua igreja faz parte de uma rede que
              já usa o sistema, peça à igreja sede o link de cadastro. Se você recebeu um convite para entrar numa
              igreja, abra o link do e-mail.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 text-2xl font-semibold tracking-tight">
        {brand.name}
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Cadastre sua igreja</CardTitle>
          <CardDescription>
            Organize a presença digital da sua igreja. Você será o responsável por este espaço.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateCompanyForm
            requireTerms={requireTerms}
            next={next ?? undefined}
            convite={convite}
            igrejaNova={igrejaNova}
          />
        </CardContent>
      </Card>
    </div>
  );
}
