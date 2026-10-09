import type { Metadata } from "next";
import { CadastroConvites } from "@/features/platform/components/cadastro-convites";
import { getCadastroConviteService } from "@/server/cadastro";
import { exigePlatformStaff } from "@/server/platform";

export const metadata: Metadata = { title: "Convites" };

/** Cadastro aberto ou só por convite, e os convites de igreja nova. */
export default async function PlatformConvitesPage() {
  await exigePlatformStaff();
  const service = await getCadastroConviteService();
  const [aberto, convites] = await Promise.all([service.cadastroAberto(), service.listarConvites()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Convites</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Com o cadastro fechado, igreja nova só entra pelo link de vínculo de uma rede ou por um convite gerado aqui.
          Cada mudança fica registrada com quem fez.
        </p>
      </div>
      <CadastroConvites aberto={aberto} convites={convites} agora={new Date().toISOString()} />
    </div>
  );
}
