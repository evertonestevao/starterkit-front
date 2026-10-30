import { ResellerAdminShell } from "../components/area-shells";
import { getAreaLinks, getAreaShellProps, requireSuperAdminPage } from "../areaAccess";

export default async function ResellerAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPage();
  const [shell, areaLinks] = await Promise.all([getAreaShellProps(), getAreaLinks()]);

  return (
    <ResellerAdminShell
      {...shell}
      areaLinks={[...areaLinks.filter((link) => link.href !== "/admin/revendedores"), { href: "/dashboard", label: "Área do cliente" }]}
    >
      {children}
    </ResellerAdminShell>
  );
}
