import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CargosManager } from "@/features/church/components/cargos-manager";
import { getCargosService } from "@/server/cargos";
import { getActiveTenant } from "@/server/tenant";
import { canGerenciarCargos } from "@/services/cargosService";

export const metadata: Metadata = { title: "Cargos" };

export default async function CargosPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  // Member não chega aqui nem pela URL; o service e a RLS recusam de novo.
  if (!canGerenciarCargos(active.role)) notFound();

  const { cargos } = await (await getCargosService()).listar({ companyId: active.id, role: active.role });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cargos</CardTitle>
        <CardDescription>
          Os cargos que a igreja usa para os membros e a liderança. Os criados aqui valem também para as igrejas
          abaixo desta; os das igrejas acima chegam prontos para usar. Cargo identifica a pessoa — não dá acesso
          ao sistema.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CargosManager cargos={cargos} podeGerenciar />
      </CardContent>
    </Card>
  );
}
