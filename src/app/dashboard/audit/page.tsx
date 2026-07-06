import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createSupabaseAuditRepository } from "@/repositories/supabase/auditRepository";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { createAuditService } from "@/services/auditService";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Auditoria" };

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const { active } = await getActiveTenant();
  if (!active) return null;
  if (!permissionService.canViewAudit(active.role)) {
    redirect("/dashboard");
  }

  const client = await getSupabaseServerClient();
  const audit = createAuditService(createSupabaseAuditRepository(client));
  const page = await audit.listRecent(active.id, { page: Number(rawPage) || 1 });
  const entries = page.items;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Auditoria</h2>
        <p className="text-sm text-muted-foreground">
          Últimas ações registradas em {active.name}
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nenhum evento ainda"
          description="Ações como convites, mudanças de papel e billing aparecem aqui."
        />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ação</TableHead>
                  <TableHead>Entidade</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant="secondary">{entry.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.entity_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(entry.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {entries.map((entry) => (
              <Card key={entry.id}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Badge variant="secondary">{entry.action}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.entity_type ?? "—"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(entry.created_at)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <PaginationControls
            page={page.page}
            pageSize={page.pageSize}
            total={page.total}
            basePath="/dashboard/audit"
          />
        </>
      )}
    </div>
  );
}
