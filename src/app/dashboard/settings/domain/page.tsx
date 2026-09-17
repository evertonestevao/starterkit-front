import type { Metadata } from "next";
import { Church } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { CustomDomainSection } from "@/features/church/components/custom-domain-section";
import { getChurchDomainService } from "@/server/churchDomain";
import { getActiveTenant } from "@/server/tenant";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Domínio próprio" };

export default async function ChurchDomainPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou

  const service = await getChurchDomainService();
  const views = await service.listForCompany({
    companyId: active.id,
    role: active.role,
  });
  // Mesma capability de "editar dados da empresa": quem configura a igreja.
  const canManage = permissionService.canEditCompany(active.role);

  if (views.length === 0) {
    return (
      <EmptyState
        icon={Church}
        title="Nenhuma igreja cadastrada ainda"
        description="Cadastre a igreja desta empresa para configurar o endereço público e, se quiser, um domínio próprio."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {views.map((view) => (
        <section key={view.churchId} className="flex flex-col gap-4">
          {/* Empresa com mais de uma igreja: cada uma tem seu próprio domínio. */}
          {views.length > 1 ? (
            <h3 className="text-sm font-semibold text-muted-foreground">
              {view.churchName}
            </h3>
          ) : null}
          <CustomDomainSection view={view} canManage={canManage} />
        </section>
      ))}
    </div>
  );
}
