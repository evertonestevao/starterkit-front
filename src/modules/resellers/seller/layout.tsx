import { SellerShell } from "../components/area-shells";
import { getAreaLinks, getAreaShellProps, hasCompany, requireSellerPage } from "../areaAccess";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  await requireSellerPage();
  const [shell, areaLinks, withCompany] = await Promise.all([getAreaShellProps(), getAreaLinks(), hasCompany()]);

  return (
    <SellerShell
      {...shell}
      areaLinks={[
        ...areaLinks.filter((link) => link.href !== "/vendedor"),
        ...(withCompany ? [{ href: "/dashboard", label: "Área do cliente" }] : []),
      ]}
    >
      {children}
    </SellerShell>
  );
}
