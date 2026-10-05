import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcessosForm, type CargoAcessos } from "@/features/acessos/components/acessos-form";
import { MODULOS_LIBERAVEIS, MODULO_INFO, celula } from "@/lib/menuPermissoes";
import { getMenuPermissoesService } from "@/server/menuPermissoes";
import { getActiveTenant } from "@/server/tenant";
import { canConfigurarAcessos } from "@/services/menuPermissoesService";

export const metadata: Metadata = { title: "Acessos" };

export default async function AcessosPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  // Só o Responsável chega aqui; o service e o banco recusam de novo.
  if (!canConfigurarAcessos(active.role)) notFound();

  const { cargos, matriz } = await (await getMenuPermissoesService()).matriz({
    companyId: active.id,
    role: active.role,
  });

  const linhas: CargoAcessos[] = cargos.map((cargo) => ({
    cargoId: cargo.id,
    nome: cargo.nome,
    // O professor já entra na EBD pela classe em que ensina, sem depender daqui.
    nota:
      cargo.slug === "professor_ebd"
        ? "Quem é professor de uma classe já entra na EBD e vê apenas a classe dele: alunos, chamada e relatórios dela. Marque EBD aqui só se este cargo deve cuidar da escola inteira (todas as classes, trimestres e regras)."
        : null,
    modulos: MODULOS_LIBERAVEIS.map((modulo) => {
      const c = celula(matriz, cargo.id, modulo);
      return {
        modulo,
        titulo: MODULO_INFO[modulo].titulo,
        permitido: c?.permitido ?? false,
        herdado: c?.herdado ?? false,
        herdadoDe: c?.herdadoDe ?? null,
        propria: c?.propria ?? false,
      };
    }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acessos</CardTitle>
        <CardDescription>
          Escolha o que cada cargo pode usar no sistema. Quem tem login e o cargo na ficha de membro passa a usar o
          módulo marcado como um administrador usa, só naquele módulo. Os cargos já vêm com um padrão marcado, que você
          pode ajustar. Responsável e Administrador já acessam tudo. As
          igrejas abaixo desta seguem o que for definido aqui até mudarem algo; a partir daí ficam com a configuração
          delas, e o que mudar aqui não as afeta mais.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <AcessosForm cargos={linhas} />

        <div className="flex flex-col gap-2 text-sm">
          <h3 className="font-medium">O que cada módulo libera</h3>
          <ul className="flex flex-col gap-2">
            {MODULOS_LIBERAVEIS.map((modulo) => (
              <li key={modulo}>
                <span className="font-medium">{MODULO_INFO[modulo].titulo}:</span> {MODULO_INFO[modulo].libera}
                {MODULO_INFO[modulo].aviso ? (
                  <span className="block text-xs text-amber-700 dark:text-amber-400">
                    Atenção: {MODULO_INFO[modulo].aviso}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Não são liberáveis por cargo: assinatura, Pix e cartão, esta tela de acessos, logins e convites dos membros
            e pedidos de oração.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
