import Link from "next/link";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { createResellerAction, setModuleEnabledAction } from "../actions";
import { createResellerAdminRepository } from "../adminRepository";
import { requireSuperAdminPage } from "../areaAccess";
import { ActionForm } from "../components/action-form";
import { formatCents } from "../format";

const STATUS_LABEL = { pending: "Aguardando", active: "Ativo", suspended: "Suspenso" } as const;

export default async function ResellersPage() {
  await requireSuperAdminPage();
  const repo = createResellerAdminRepository(await getSupabaseServerClient());
  const [settings, resellers] = await Promise.all([repo.getSettings(), repo.listResellers()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Vendedores</h2>
        <p className="text-sm text-muted-foreground">Cadastro por convite e totais de cada vendedor</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Módulo de revendedores</CardTitle>
            <CardDescription>
              {settings.resellers_enabled
                ? "Ligado: links e novas vendas funcionam."
                : "Desligado: o link é ignorado e ninguém novo é vinculado. Quem já vendeu continua gerando comissão."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={setModuleEnabledAction}
              submitLabel={settings.resellers_enabled ? "Desligar módulo" : "Ligar módulo"}
              variant={settings.resellers_enabled ? "outline" : "default"}
            >
              <input type="hidden" name="enabled" value={String(!settings.resellers_enabled)} />
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cadastrar vendedor</CardTitle>
            <CardDescription>O vendedor recebe um e-mail para definir a senha.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createResellerAction} submitLabel="Enviar convite">
              <div className="flex flex-col gap-2">
                <Label htmlFor="reseller-name">Nome</Label>
                <Input id="reseller-name" name="name" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reseller-email">E-mail</Label>
                <Input id="reseller-email" name="email" type="email" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="reseller-code">Código de indicação (vazio = gerar)</Label>
                <Input id="reseller-code" name="referralCode" placeholder="maria-silva" />
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      {resellers.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Users className="size-4" aria-hidden />
            Nenhum vendedor cadastrado ainda.
          </CardContent>
        </Card>
      ) : (
        // Uma só estrutura: colunas no desktop, card empilhado no mobile.
        <ul className="flex flex-col gap-3">
          {resellers.map((reseller) => (
            <li key={reseller.id}>
              <Card>
                <CardContent className="grid gap-2 text-sm md:grid-cols-[2fr_1fr_1fr_1fr] md:items-center">
                  <div className="min-w-0">
                    <Link href={`/admin/revendedores/${reseller.id}`} className="font-medium hover:underline">
                      {reseller.name}
                    </Link>{" "}
                    <Badge variant={reseller.status === "active" ? "secondary" : "destructive"}>
                      {STATUS_LABEL[reseller.status]}
                    </Badge>
                    <p className="truncate text-xs text-muted-foreground">
                      {reseller.email} · {reseller.referral_code}
                    </p>
                  </div>
                  <p>
                    <span className="text-muted-foreground">Clientes ativos: </span>
                    {reseller.active_clients}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Pendente: </span>
                    {formatCents(reseller.pending_cents)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Pago: </span>
                    {formatCents(reseller.paid_cents)}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
