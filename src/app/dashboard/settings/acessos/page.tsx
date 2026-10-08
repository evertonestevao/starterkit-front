import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AcessosForm, type CargoAcessos } from "@/features/acessos/components/acessos-form";
import { ModulosAtivosForm, type ModuloLinha } from "@/features/acessos/components/modulos-ativos-form";
import { MODULOS_DESLIGAVEIS, MODULOS_LIBERAVEIS, MODULO_INFO, celula, isModuloDesligavel } from "@/lib/menuPermissoes";
import { getMenuPermissoesService } from "@/server/menuPermissoes";
import { getModuloAtivoService } from "@/server/moduloAtivo";
import { getActiveTenant } from "@/server/tenant";
import { canConfigurarAcessos } from "@/services/menuPermissoesService";
import { podeConfigurarModulos } from "@/services/moduloAtivoService";

export const metadata: Metadata = { title: "Acessos" };

export default async function AcessosPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  // Responsável configura cargo; Responsável OU Administrador liga/desliga módulo.
  if (!canConfigurarAcessos(active.role) && !podeConfigurarModulos(active.role)) notFound();

  const modulosMatriz = podeConfigurarModulos(active.role)
    ? await (await getModuloAtivoService()).matriz({ companyId: active.id, role: active.role })
    : new Map();

  const modulosLinhas: ModuloLinha[] = MODULOS_DESLIGAVEIS.map((modulo) => {
    const c = modulosMatriz.get(modulo);
    return {
      modulo,
      titulo: MODULO_INFO[modulo].titulo,
      ativo: c?.ativo ?? true,
      herdado: c?.herdado ?? true,
      herdadoDe: c?.herdadoDe ?? null,
      propria: c?.propria ?? false,
    };
  });

  // Módulo desligado pela igreja nem aparece como opção de cargo pra marcar.
  const modulosLigados = new Set(
    MODULOS_LIBERAVEIS.filter((m) => !isModuloDesligavel(m) || (modulosMatriz.get(m)?.ativo ?? true)),
  );

  const { cargos, matriz } = canConfigurarAcessos(active.role)
    ? await (await getMenuPermissoesService()).matriz({ companyId: active.id, role: active.role })
    : { cargos: [], matriz: new Map() };

  const linhas: CargoAcessos[] = cargos.map((cargo) => ({
    cargoId: cargo.id,
    nome: cargo.nome,
    // O professor já entra na EBD pela classe em que ensina, sem depender daqui.
    nota:
      cargo.slug === "professor_ebd"
        ? "Quem é professor de uma classe já entra na EBD e vê apenas a classe dele: alunos, chamada e relatórios dela. Marque EBD aqui só se este cargo deve cuidar da escola inteira (todas as classes, trimestres e regras)."
        : null,
    modulos: MODULOS_LIBERAVEIS.filter((modulo) => modulosLigados.has(modulo)).map((modulo) => {
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
    <div className="flex flex-col gap-6">
      {podeConfigurarModulos(active.role) ? (
        <Card>
          <CardHeader>
            <CardTitle>Módulos ativos</CardTitle>
            <CardDescription>
              Desligue o que sua igreja não usa (ex.: EBD, Presença nos cultos). Desligado, o módulo some do menu de
              todo mundo — inclusive Responsável e Administrador — e nem aparece como opção pra liberar por cargo
              abaixo. As igrejas abaixo desta seguem o que for definido aqui até mudarem algo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ModulosAtivosForm modulos={modulosLinhas} />
          </CardContent>
        </Card>
      ) : null}

      {canConfigurarAcessos(active.role) ? (
        <Card>
          <CardHeader>
            <CardTitle>Acessos por cargo</CardTitle>
            <CardDescription>
              Escolha o que cada cargo pode usar no sistema. Quem tem login e o cargo na ficha de membro passa a usar o
              módulo marcado como um administrador usa, só naquele módulo. Os cargos já vêm com um padrão marcado, que
              você pode ajustar. Responsável e Administrador já acessam tudo. As igrejas abaixo desta seguem o que for
              definido aqui até mudarem algo; a partir daí ficam com a configuração delas, e o que mudar aqui não as
              afeta mais.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <AcessosForm cargos={linhas} />

            <div className="flex flex-col gap-2 text-sm">
              <h3 className="font-medium">O que cada módulo libera</h3>
              <ul className="flex flex-col gap-2">
                {MODULOS_LIBERAVEIS.filter((modulo) => modulosLigados.has(modulo)).map((modulo) => (
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
                Não são liberáveis por cargo: assinatura, Pix e cartão, esta tela de acessos, logins e convites dos
                membros e pedidos de oração.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
