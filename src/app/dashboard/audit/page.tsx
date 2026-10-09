import { redirect } from "next/navigation";

/** Endereço antigo: a Auditoria fica em Configurações. */
export default async function AuditAntigo({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  redirect(page ? `/dashboard/settings/auditoria?page=${encodeURIComponent(page)}` : "/dashboard/settings/auditoria");
}
