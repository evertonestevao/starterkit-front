import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MensalidadeCard } from "@/features/church/components/self-payment-card";
import { getChurchDomainService } from "@/server/churchDomain";
import { getChurchSelfPaymentService } from "@/server/churchSelfPayment";
import { exigeMenu } from "@/server/menuPermissoes";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";

export const metadata: Metadata = { title: "Mensalidade" };

/**
 * Mensalidade da igreja: quanto ela paga por mês para usar a plataforma, em
 * que pé está, e o cadastro de quem paga. O valor é definido pela plataforma
 * (o padrão, ou o combinado com esta igreja). Só quem administra a igreja vê;
 * a permissão de verdade é das funções do banco.
 */
export default async function MensalidadePage() {
  await exigeMenu("mensalidade");
  const { active } = await getActiveTenant();
  if (!active) notFound();

  const client = await getSupabaseServerClient();
  const [igrejas, { data: userData }] = await Promise.all([
    (await getChurchDomainService()).listForCompany({ companyId: active.id, role: active.role }),
    client.auth.getUser(),
  ]);
  const service = await getChurchSelfPaymentService();
  const mensalidades = await Promise.all(
    igrejas.map(async (i) => ({
      churchId: i.churchId,
      churchName: i.churchName,
      status: await service.getStatus(i.churchId),
    })),
  );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Mensalidade</h2>
        <p className="text-sm text-muted-foreground">
          O que a igreja paga por mês para usar o sistema. O pagamento é automático: você configura uma vez e a cobrança
          é feita todo mês.
        </p>
      </div>
      {mensalidades.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma igreja nesta conta.</p>
      ) : (
        mensalidades.map(({ churchId, churchName, status }) => (
          <MensalidadeCard
            key={churchId}
            churchId={churchId}
            churchName={churchName}
            status={status}
            defaultEmail={userData.user?.email ?? ""}
          />
        ))
      )}
      <p className="text-xs text-muted-foreground">
        O valor é definido pela plataforma. Dúvida sobre a mensalidade ou a cobrança? Fale com quem cuida do sistema no
        seu ministério.
      </p>
    </div>
  );
}
