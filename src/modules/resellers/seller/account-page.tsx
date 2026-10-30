import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountDataSection } from "@/features/account/components/account-data-section";
import { getAccountService } from "@/server/account";
import { requireSellerPage } from "../areaAccess";

/** Quem é só vendedor não tem as Configurações do dashboard, que exigem empresa. */
export default async function SellerAccountPage() {
  await requireSellerPage();
  const plan = await (await getAccountService()).getDeletionPlan();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight">Minha conta</h2>
      <Card>
        <CardHeader>
          <CardTitle>Seus dados</CardTitle>
          <CardDescription>Exportação e exclusão dos seus dados pessoais</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountDataSection
            blockers={plan.blockers}
            companiesToClose={plan.companiesToClose.map((company) => company.companyName)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
