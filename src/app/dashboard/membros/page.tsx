import Link from "next/link";
import { Cake, FileSignature, FileUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginationControls } from "@/components/pagination-controls";
import { ExportarMembros } from "@/features/acompanhamento/components/exportar-membros";
import { MembroForm } from "@/features/acompanhamento/components/membro-form";
import { ConvitesSemMembro } from "@/features/acompanhamento/components/convites-sem-membro";
import { MembrosKpisFaixa } from "@/features/acompanhamento/components/membros-kpis";
import { MembrosFiltros } from "@/features/acompanhamento/components/membros-filtros";
import { MembrosLista } from "@/features/acompanhamento/components/membros-lista";
import { FILTRO_SITUACAO_LABEL, lerFiltroSituacao, type FiltroSituacao } from "@/lib/rolMembros";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { MEMBROS_POR_PAGINA, MEMBROS_POR_PAGINA_PADRAO } from "@/services/acompanhamentoService";

export const metadata: Metadata = { title: "Membros da igreja" };

export default async function RolMembrosPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    porPagina?: string;
    q?: string;
    inativos?: string;
    situacao?: string;
    cargo?: string;
  }>;
}) {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const sp = await searchParams;

  const service = await getAcompanhamentoService();
  const gerenciaAcesso = actor.role === "owner" || actor.role === "admin";
  const [resultado, cargos, kpis, acessos] = await Promise.all([
    service.listMembrosPaginado(actor, {
      page: Number(sp.page) || 1,
      pageSize: Number(sp.porPagina) || undefined,
      busca: sp.q,
      inativos: sp.inativos === "1",
      situacao: sp.situacao,
      cargoId: sp.cargo,
    }),
    service.cargosDisponiveis(actor),
    service.kpisMembros(actor),
    service.acessos(actor),
  ]);
  const { items, total, page, pageSize } = resultado;
  // O antigo ?inativos=1 continua valendo como "todas as situações".
  const situacao: FiltroSituacao = sp.situacao
    ? lerFiltroSituacao(sp.situacao)
    : sp.inativos === "1"
      ? "todas"
      : "ativo";

  const inicio = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-4">
      <MembrosKpisFaixa kpis={kpis} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Para tirar alguém da chamada sem perder o histórico, edite e desmarque &ldquo;Ativo&rdquo;. Cadastro feito por
          engano pode ser excluído na ficha do membro.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/membros/sem-termo" className={buttonVariants({ variant: "outline" })}>
            <FileSignature className="size-4" /> Sem termo
          </Link>
          <Link href="/dashboard/membros/aniversariantes" className={buttonVariants({ variant: "outline" })}>
            <Cake className="size-4" /> Aniversariantes
          </Link>
          <ExportarMembros cargos={cargos} situacao={situacao} cargoId={sp.cargo ?? ""} />
          <Link href="/dashboard/membros/importar" className={buttonVariants({ variant: "outline" })}>
            <FileUp className="size-4" /> Importar planilha
          </Link>
          <MembroForm cargos={cargos} podeConvidar={gerenciaAcesso} />
        </div>
      </div>
      <MembrosFiltros opcoesPorPagina={MEMBROS_POR_PAGINA} padrao={MEMBROS_POR_PAGINA_PADRAO} cargos={cargos} />
      <MembrosLista
        membros={items}
        filtrando={Boolean(sp.q || sp.cargo || situacao !== "ativo")}
        cargos={cargos}
        acessos={acessos.porUsuario}
        convites={acessos.convitePorEmail}
        gerenciaAcesso={gerenciaAcesso}
      />
      <div className="flex flex-col gap-2">
        {/* Com mais de uma página, a paginação abaixo já mostra o total. */}
        {total > 0 && total <= pageSize ? (
          <p className="text-xs text-muted-foreground">
            Mostrando {inicio}–{fim} de {total} {total === 1 ? "membro" : "membros"}
            {situacao === "ativo"
              ? total === 1
                ? " ativo"
                : " ativos"
              : ` · ${FILTRO_SITUACAO_LABEL[situacao].toLowerCase()}`}
          </p>
        ) : null}
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          basePath="/dashboard/membros"
          params={{
            q: sp.q,
            situacao: situacao === "ativo" ? undefined : situacao,
            porPagina: sp.porPagina,
            cargo: sp.cargo,
          }}
        />
      </div>
      {gerenciaAcesso && acessos.convitesSemMembro.length > 0 && !sp.q && !sp.cargo ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Convites enviados para quem ainda não está no rol
          </h3>
          <ConvitesSemMembro convites={acessos.convitesSemMembro} />
        </section>
      ) : null}
    </div>
  );
}
