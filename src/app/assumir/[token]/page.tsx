import type { Metadata } from "next";
import Link from "next/link";
import { Church, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AssumirForm, CriarSenhaEAssumirForm } from "@/features/rede/components/assumir-forms";
import { getAssumirService } from "@/server/redeCadastro";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { signOutAction } from "@/server/actions/auth";
import type { EstadoConvite } from "@/services/redeCadastroService";

export const metadata: Metadata = {
  title: "Assumir igreja",
  // O caminho carrega o token do convite.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const SEM_VALIDADE: Record<Exclude<EstadoConvite, "valido">, string> = {
  usado: "Este convite já foi usado. Se foi você, é só entrar com o seu e-mail e senha.",
  substituido: "Este convite não vale mais: um convite novo foi gerado, ou a igreja já tem responsável.",
  expirado: "Este convite venceu. Peça um novo a quem cadastrou a igreja.",
};

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <Alert>
      <Info className="size-4" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/**
 * Link para assumir uma igreja cadastrada pela de cima. Abrir não muda nada:
 * assumir é o botão. Quem não tem conta cria só a senha (o link prova que é a
 * pessoa); quem tem, entra com a senha dela; logado com outro e-mail, não assume.
 */
export default async function AssumirPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const convite = await (await getAssumirService()).consultar(token);
  if (!convite) return <Aviso>Link inválido. Confira se ele veio inteiro na mensagem.</Aviso>;
  if (convite.estado !== "valido" || !convite.email) {
    return <Aviso>{SEM_VALIDADE[convite.estado === "valido" ? "substituido" : convite.estado]}</Aviso>;
  }

  const { data } = await (await getSupabaseServerClient()).auth.getUser();
  const logadoComo = data.user?.email?.toLowerCase() ?? null;
  const caminho = `/assumir/${token}`;

  let acao: React.ReactNode;
  if (logadoComo === convite.email) {
    acao = <AssumirForm token={token} igreja={convite.igreja} />;
  } else if (logadoComo) {
    acao = (
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Você está conectado como <strong>{logadoComo}</strong>, mas este convite é para{" "}
          <strong>{convite.email}</strong>. Saia e entre com o e-mail do convite.
        </p>
        <form action={signOutAction}>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Sair desta conta
          </button>
        </form>
      </div>
    );
  } else if (convite.contaExiste) {
    acao = (
      <div className="flex flex-col gap-3 text-sm">
        <p>
          O e-mail <strong>{convite.email}</strong> já tem conta no sistema. Entre com a sua senha para assumir.
        </p>
        <Link href={`/login?next=${encodeURIComponent(caminho)}`} className={buttonVariants({ size: "lg" })}>
          Entrar e assumir
        </Link>
      </div>
    );
  } else {
    acao = <CriarSenhaEAssumirForm token={token} email={convite.email} nome={convite.nome} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Church className="size-4" /> Convite para ser responsável
        </CardDescription>
        <CardTitle className="text-xl">{convite.igreja}</CardTitle>
        <CardDescription>
          {convite.substituir
            ? `${convite.mae ?? "A igreja de cima"} indicou você como o novo Responsável. Assumindo, quem responde hoje por esta igreja deixa de ter acesso e você passa a cuidar da página, dos membros e de quem mais pode acessar.`
            : `${convite.mae ? `Cadastrada por ${convite.mae}. ` : ""}Assumindo, você passa a ser o Responsável desta igreja no sistema: cuida da página, dos membros e de quem mais pode acessar.`}
        </CardDescription>
      </CardHeader>
      <CardContent>{acao}</CardContent>
    </Card>
  );
}
