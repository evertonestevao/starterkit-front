import Link from "next/link";
import { Cake, FileSignature, FileUp, Users2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginationControls } from "@/components/pagination-controls";
import { ExportarMembros } from "@/features/acompanhamento/components/exportar-membros";
import { MembroForm } from "@/features/acompanhamento/components/membro-form";
import { ConvitesSemMembro } from "@/features/acompanhamento/components/convites-sem-membro";
import { MembrosKpisFaixa } from "@/features/acompanhamento/components/membros-kpis";
import { MembrosFiltros } from "@/features/acompanhamento/components/membros-filtros";
import { MembrosLista } from "@/features/acompanhamento/components/membros-lista";
import { MembrosRedeSwitcher } from "@/features/acompanhamento/components/membros-rede-switcher";
import { descendentesDe } from "@/lib/painelRede";
import { FILTRO_SITUACAO_LABEL, lerFiltroSituacao, type FiltroSituacao } from "@/lib/rolMembros";
import { getAcompanhamentoActorAutorizado, getAcompanhamentoService } from "@/server/acompanhamento";
import { getRedePainelService } from "@/server/redePainel";
import { MEMBROS_POR_PAGINA, MEMBROS_POR_PAGINA_PADRAO } from "@/services/acompanhamentoService";

export const metadata: Metadata = { title: "Membros da igreja" };

const TIPO_LABEL: Record<string, string> = { sede: "Sede", subsede: "Subsede", congregacao: "Congregação" };

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
    unidade?: string;
    arvore?: string;
  }>;
}) {
  const actor = await getAcompanhamentoActorAutorizado();
  if (!actor) notFound();
  const sp = await searchParams;

  const service = await getAcompanhamentoService();
  const gerenciaAcesso = actor.role === "owner" || actor.role === "admin";

  // Rede (migration 20261022100000 e seguintes): owner/admin podem trocar para
  // uma unidade vinculada, e em qualquer nível pedir "+ rede" (`arvore=1`) —
  // mistura a unidade escolhida com as unidades vinculadas a ELA (não só a
  // partir da própria igreja). A mesma RLS de sempre decide linha a linha:
  // editável só quando a linha é da empresa ativa, leitura (e só com termo
  // assinado) nas demais. `unidade` fora da lista é tratado como "nenhuma" —
  // a RLS barraria mesmo assim, isto só evita tela quebrada.
  const redePainel = gerenciaAcesso ? await getRedePainelService() : null;
  const unidadesRede = redePainel ? await redePainel.temUnidades(actor).then(async (tem) => (tem ? (await redePainel.carregar(actor)).unidades : [])) : [];
  const unidadeEscolhida = sp.unidade ? (unidadesRede.find((u) => u.churchId === sp.unidade) ?? null) : null;
  const incluirAbaixo = sp.arvore === "1";
  const verRede = Boolean(unidadeEscolhida) && !incluirAbaixo;
  const verArvore = incluirAbaixo;

  // A igreja ativa, só quando precisa (raiz da árvore quando ninguém foi
  // escolhida, e sempre o "quem pode editar" da lista em modo árvore).
  const minhaIgreja = verArvore || unidadeEscolhida === null ? await service.igreja(actor) : null;

  const baseChurchId = unidadeEscolhida?.churchId ?? minhaIgreja?.id;
  const baseChurchNome = unidadeEscolhida?.churchName ?? "Minha igreja";
  const unidadesVinculadas = baseChurchId ? descendentesDe(baseChurchId, unidadesRede) : [];
  const baseTemFilhos = unidadesVinculadas.length > 0;
  const fraseVinculadas = `${unidadesVinculadas.length} ${unidadesVinculadas.length === 1 ? "vinculada" : "vinculadas"}`;

  const idsArvore = verArvore && baseChurchId ? [baseChurchId, ...unidadesVinculadas.map((u) => u.churchId)] : [];
  const nomesArvore =
    verArvore && baseChurchId
      ? {
          [baseChurchId]: baseChurchId === minhaIgreja?.id ? "Minha igreja" : baseChurchNome,
          ...Object.fromEntries(unidadesVinculadas.map((u) => [u.churchId, u.churchName])),
        }
      : undefined;

  const [resultado, cargos, kpis, acessos, kpisRede, kpisRedeArvore] = await Promise.all([
    verArvore
      ? service.listMembrosTodaRedePaginado(actor, idsArvore, {
          page: Number(sp.page) || 1,
          pageSize: Number(sp.porPagina) || undefined,
          busca: sp.q,
          situacao: sp.situacao,
          cargoId: sp.cargo,
        })
      : verRede && unidadeEscolhida
        ? service.listMembrosRedePaginado(actor, unidadeEscolhida.churchId, {
            page: Number(sp.page) || 1,
            pageSize: Number(sp.porPagina) || undefined,
            busca: sp.q,
            inativos: sp.inativos === "1",
            situacao: sp.situacao,
            cargoId: sp.cargo,
          })
        : service.listMembrosPaginado(actor, {
            page: Number(sp.page) || 1,
            pageSize: Number(sp.porPagina) || undefined,
            busca: sp.q,
            inativos: sp.inativos === "1",
            situacao: sp.situacao,
            cargoId: sp.cargo,
          }),
    unidadeEscolhida ? service.cargosDisponiveisRede(actor, unidadeEscolhida.churchId) : service.cargosDisponiveis(actor),
    verRede || verArvore ? Promise.resolve(null) : service.kpisMembros(actor),
    verRede ? Promise.resolve({ porUsuario: {}, convitePorEmail: {}, convitesSemMembro: [] }) : service.acessos(actor),
    verRede && unidadeEscolhida ? service.kpisMembrosRede(actor, unidadeEscolhida.churchId) : Promise.resolve(null),
    baseChurchId && (verArvore || baseTemFilhos) ? service.kpisMembrosRedeArvore(actor, baseChurchId) : Promise.resolve(null),
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
      {unidadesRede.length > 0 ? (
        <MembrosRedeSwitcher
          unidades={unidadesRede}
          unidadeAtivaId={unidadeEscolhida?.churchId ?? null}
          unidadeAtivaNome={unidadeEscolhida?.churchName ?? null}
          arvoreAtiva={verArvore}
        />
      ) : null}

      {verArvore ? (
        <div className="grid grid-cols-2 gap-3 sm:w-fit">
          <MetricCard
            icon={Users2}
            label="Membros"
            value={kpisRedeArvore?.total ?? 0}
            hint={`${baseChurchNome} + ${fraseVinculadas}`}
          />
          <MetricCard
            icon={FileSignature}
            label="Sem aceitar o termo"
            value={kpisRedeArvore?.semConsentimento ?? 0}
            hint={`${baseChurchNome} + ${fraseVinculadas}`}
          />
        </div>
      ) : verRede ? (
        <div className="grid grid-cols-2 gap-3 sm:w-fit sm:grid-cols-4">
          <MetricCard icon={Users2} label="Membros" value={kpisRede?.total ?? 0} hint="de fato, nesta unidade" />
          <MetricCard
            icon={FileSignature}
            label="Sem aceitar o termo"
            value={kpisRede?.semConsentimento ?? 0}
            hint="não aparecem na lista abaixo"
          />
          {baseTemFilhos ? (
            <>
              <MetricCard
                icon={Users2}
                label="Membros (+ rede)"
                value={kpisRedeArvore?.total ?? 0}
                hint={`esta unidade + ${fraseVinculadas} a ela`}
              />
              <MetricCard
                icon={FileSignature}
                label="Sem aceitar (+ rede)"
                value={kpisRedeArvore?.semConsentimento ?? 0}
                hint={`esta unidade + ${fraseVinculadas} a ela`}
              />
            </>
          ) : null}
        </div>
      ) : (
        <MembrosKpisFaixa kpis={kpis!} />
      )}

      {verRede && unidadeEscolhida ? (
        <p className="text-sm text-muted-foreground">
          Cadastro de <strong>{unidadeEscolhida.churchName}</strong> — somente leitura. Presença, EBD e
          acompanhamento pastoral continuam só da própria igreja.
          {baseTemFilhos ? (
            <>
              {" "}
              <Link
                href={`/dashboard/membros?unidade=${unidadeEscolhida.churchId}&arvore=1`}
                className="font-medium text-primary hover:underline"
              >
                Ver com {fraseVinculadas} →
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {verArvore ? (
        <p className="text-sm text-muted-foreground">
          <strong>{baseChurchNome}</strong> + {fraseVinculadas} a ela. Linhas de outras igrejas aparecem só leitura;
          presença, EBD e acompanhamento pastoral continuam só da própria igreja de cada um.
        </p>
      ) : null}
      {baseTemFilhos ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-primary select-none hover:underline">
            Ver quais ({unidadesVinculadas.length}) →
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {unidadesVinculadas.map((u) => (
              <li key={u.churchId}>
                <Link
                  href={`/dashboard/membros?unidade=${u.churchId}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
                >
                  <span className="truncate">{u.churchName}</span>
                  <span className="shrink-0 text-xs">{TIPO_LABEL[u.tipo] ?? u.tipo}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {!verRede ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* No celular a dica some: o espaço é da busca e da lista. */}
          <p className="hidden text-sm text-muted-foreground sm:block">
            Para tirar alguém da chamada sem perder o histórico, edite e desmarque &ldquo;Ativo&rdquo;. Cadastro feito
            por engano pode ser excluído na ficha do membro.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/membros/sem-termo" className={buttonVariants({ variant: "outline" })}>
              <FileSignature className="size-4" /> Sem termo
            </Link>
            {/* No celular o cartão "Aniversariantes" acima já leva à lista. */}
            <Link
              href="/dashboard/membros/aniversariantes"
              className={cn(buttonVariants({ variant: "outline" }), "hidden sm:inline-flex")}
            >
              <Cake className="size-4" /> Aniversariantes
            </Link>
            <ExportarMembros cargos={cargos} situacao={situacao} cargoId={sp.cargo ?? ""} />
            <Link href="/dashboard/membros/importar" className={buttonVariants({ variant: "outline" })}>
              <FileUp className="size-4" /> Importar planilha
            </Link>
            {/* No celular, "Novo membro" vem primeiro: é o que mais se usa. */}
            <div className="order-first sm:order-none">
              <MembroForm cargos={cargos} podeConvidar={gerenciaAcesso} />
            </div>
          </div>
        </div>
      ) : null}

      <MembrosFiltros opcoesPorPagina={MEMBROS_POR_PAGINA} padrao={MEMBROS_POR_PAGINA_PADRAO} cargos={cargos} />
      <MembrosLista
        membros={items}
        filtrando={Boolean(sp.q || sp.cargo || situacao !== "ativo")}
        cargos={cargos}
        acessos={acessos.porUsuario}
        convites={acessos.convitePorEmail}
        gerenciaAcesso={gerenciaAcesso}
        readOnly={verRede}
        minhaIgrejaId={minhaIgreja?.id}
        nomesIgrejas={nomesArvore}
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
            unidade: sp.unidade,
            arvore: sp.arvore,
          }}
        />
      </div>
      {!verRede && gerenciaAcesso && acessos.convitesSemMembro.length > 0 && !sp.q && !sp.cargo ? (
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
