import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Contact,
  HandHeart,
  HeartHandshake,
  Megaphone,
  MessageCircleHeart,
  type LucideIcon,
} from "lucide-react";
import {
  PrimeirosPassos,
  temPrimeirosPassos,
  type PrimeirosPassosDados,
} from "@/features/church/components/primeiros-passos";
import { getChurchPixService } from "@/server/churchPix";
import { nomeCompletoDaIgreja } from "@/server/nomeDaIgreja";
import { getChurchProfileService } from "@/server/churchProfile";
import { AniversariantesCard } from "@/features/acompanhamento/components/aniversariantes-card";
import { getSaudacaoAtiva } from "@/server/saudacao";
import { MiniBarChart, type PontoGrafico } from "@/components/mini-bar-chart";
import { Card, CardContent } from "@/components/ui/card";
import { ChurchLinkNotices } from "@/features/church/components/church-link-notices";
import { formatarData, formatarPercentual, hojeISO, somarDias } from "@/lib/acompanhamento";
import { domingoSugerido, totaisDoDia } from "@/lib/ebd";
import { menusVisiveis, paginaInicial } from "@/lib/menuPermissoes";
import { PAPEL_LABEL } from "@/lib/papeis";
import { createSupabaseInviteRepository } from "@/repositories/supabase/inviteRepository";
import { getAcompanhamentoService } from "@/server/acompanhamento";
import { getCampaignsService } from "@/server/campaigns";
import { getCargosService } from "@/server/cargos";
import { getChurchEventsService } from "@/server/churchEvents";
import { getChurchLinkService } from "@/server/churchLinks";
import { getCommunityService } from "@/server/community";
import { getEbdActor, getEbdService } from "@/server/ebd";
import { createMemoryRateLimiter } from "@/server/rateLimit";
import { getSupabaseServerClient } from "@/server/supabase-server";
import { getActiveTenant } from "@/server/tenant";
import { createInviteService } from "@/services/inviteService";
import { permissionService } from "@/services/permissionService";

export const metadata: Metadata = { title: "Painel" };

/** Um número do painel: só existe para quem tem o menu correspondente. */
interface Numero {
  icon: LucideIcon;
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  href: string;
  /** Pede atenção (ex.: gente em alerta, pedido esperando). */
  atencao?: boolean;
}

/** Roda a consulta só se a pessoa tem o menu; falha vira null (o número some, o painel não cai). */
function se<T>(tem: boolean, nome: string, consulta: () => Promise<T>): Promise<T | null> {
  if (!tem) return Promise.resolve(null);
  return consulta().catch((err: unknown) => {
    console.error(`[dashboard] falha ao carregar ${nome}`, err);
    return null;
  });
}

/**
 * Painel: um resumo curto do que a pessoa pode acessar, e mais nada. Cada
 * número e cada atalho só aparece para quem tem o menu dele (papel, cargo
 * liberado ou autorização) — a mesma regra da sidebar e da guarda das telas.
 */
export default async function DashboardPage() {
  const { active } = await getActiveTenant();
  if (!active) return null; // layout já redirecionou
  // Quem só dá aula na EBD não tem o painel geral: cai direto na EBD.
  if (paginaInicial(active) !== "/dashboard") redirect(paginaInicial(active));

  const menus = new Set(menusVisiveis(active));
  const tem = (menu: string) => menus.has(menu);
  const isAdmin = permissionService.canManageMembers(active.role);
  const client = await getSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  const domingo = domingoSugerido(hojeISO());
  const acompanhamentoActor = { companyId: active.id, role: active.role, podeAcompanhar: active.pode_acompanhar };

  const hoje = hojeISO();
  // Os últimos 6 domingos, do mais antigo ao mais recente.
  const domingos = [5, 4, 3, 2, 1, 0].map((semanas) => somarDias(domingo, -7 * semanas));

  const [
    linkNotices,
    meusCargos,
    presenca,
    membros,
    ebd,
    oracao,
    visitas,
    eventos,
    campanhas,
    convites,
    cultos,
    ebdDomingos,
    aniversarios,
    saudacao,
    primeirosPassos,
  ] = await Promise.all([
      // Respostas a convites de vínculo entre igrejas.
      se(!!auth.user, "os avisos de vínculo", async () =>
        (await getChurchLinkService()).listNotices({ companyId: active.id, role: active.role, userId: auth.user!.id }),
      ),
      se(true, "os cargos", async () =>
        (await getCargosService()).meusCargos({ companyId: active.id, role: active.role }),
      ),
      se(tem("acompanhamento"), "o resumo da presença", async () =>
        (await getAcompanhamentoService()).resumo(acompanhamentoActor),
      ),
      se(tem("membros"), "os números dos membros", async () =>
        (await getAcompanhamentoService()).kpisMembros(acompanhamentoActor),
      ),
      se(tem("ebd"), "o resumo da EBD", async () => {
        const actor = await getEbdActor();
        return actor ? totaisDoDia(await (await getEbdService()).resumoDoDia(actor, domingo)) : null;
      }),
      se(tem("prayers"), "os pedidos de oração", async () =>
        (await getCommunityService()).getUnseenPrayerCount(active.id),
      ),
      se(tem("relationships"), "os pedidos de visita", async () =>
        (await getCommunityService()).countVisitas(active.id),
      ),
      se(tem("events"), "os eventos", async () => (await (await getChurchEventsService()).getAgenda(active.id)).proximos),
      se(tem("campaigns"), "as campanhas", async () =>
        (await (await getCampaignsService()).list(active.id)).filter((c) => c.status === "ativa").length,
      ),
      se(isAdmin, "os convites", () =>
        createInviteService({
          repo: createSupabaseInviteRepository(client),
          rateLimiter: createMemoryRateLimiter({ limit: 1000, windowMs: 60_000 }),
        }).listPending(active.id),
      ),
      // Gráficos: presença por culto (8 semanas) e EBD por domingo.
      se(tem("acompanhamento"), "a presença por culto", async () =>
        (await getAcompanhamentoService()).chamadasDoPeriodo(acompanhamentoActor, { de: somarDias(hoje, -56), ate: hoje }),
      ),
      se(tem("ebd"), "a EBD por domingo", async () => {
        const actor = await getEbdActor();
        if (!actor) return null;
        const service = await getEbdService();
        return Promise.all(domingos.map(async (d) => ({ data: d, ...totaisDoDia(await service.resumoDoDia(actor, d)) })));
      }),
      // Próximos aniversários: de quem tem o módulo Membros. O cartão filtra por tipo na tela,
      // então vêm mais do que os 6 que ele mostra.
      se(tem("membros"), "os aniversariantes", async () =>
        (await getAcompanhamentoService()).proximosAniversarios(acompanhamentoActor, 60),
      ),
      getSaudacaoAtiva(),
      // Primeiros passos de quem administra: página no ar e Pix (a primeira igreja da conta).
      se(isAdmin, "os primeiros passos", async (): Promise<PrimeirosPassosDados | null> => {
        const [perfis, pix] = await Promise.all([
          (await getChurchProfileService()).list(active.id),
          (await getChurchPixService()).listChurches(active.id),
        ]);
        const perfil = perfis[0];
        if (!perfil) return null;
        const doPix = pix.find((c) => c.id === perfil.id);
        return {
          churchId: perfil.id,
          chavePublica: perfil.chavePublica,
          temEndereco: Boolean(perfil.address),
          paginaAtiva: perfil.paginaAtiva,
          pix: doPix?.pixStatus ?? "sem_chave",
          pixMotivoRecusa: doPix?.pixMotivoRecusa ?? null,
        };
      }),
    ]);

  const dia = (data: string) => formatarData(data).slice(0, 5);
  // Presença = presentes ÷ (presentes + ausentes); justificados ficam de fora.
  const graficoCultos: PontoGrafico[] = [...(cultos ?? [])]
    .sort((a, b) => a.data.localeCompare(b.data))
    .slice(-12)
    .map((c) => {
      const marcados = c.presentes + c.ausentes;
      const pct = marcados > 0 ? (c.presentes / marcados) * 100 : null;
      return {
        rotulo: dia(c.data),
        valor: pct,
        valorTexto: formatarPercentual(pct),
        detalhe: `${c.cultoNome} · ${c.presentes} de ${marcados} presentes`,
      };
    });
  const graficoEbd: PontoGrafico[] = (ebdDomingos ?? []).map((d) => ({
    rotulo: dia(d.data),
    valor: d.classesComChamada > 0 ? d.presentes : null,
    valorTexto: String(d.presentes),
    detalhe: d.classesComChamada > 0 ? `presentes de ${d.matriculados} matriculados` : "chamada não feita",
  }));

  const numeros: Numero[] = [];
  if (presenca) {
    const marcados = presenca.presentes + presenca.ausentes;
    numeros.push({
      icon: ClipboardCheck,
      rotulo: "Em alerta de faltas",
      valor: presenca.emAlerta,
      detalhe: presenca.ultimaChamadaData
        ? `último culto: ${marcados > 0 ? formatarPercentual((presenca.presentes / marcados) * 100) : "—"} de presença`
        : "nenhuma chamada ainda",
      href: presenca.emAlerta > 0 ? "/dashboard/acompanhamento/alertas" : "/dashboard/acompanhamento",
      atencao: presenca.emAlerta > 0,
    });
  }
  if (membros) {
    numeros.push({
      icon: Contact,
      rotulo: "Membros ativos",
      valor: membros.ativos,
      detalhe:
        membros.aniversariantesDoMes > 0
          ? `${membros.aniversariantesDoMes} aniversariante(s) no mês`
          : `${membros.novosNoMes} novo(s) no mês`,
      href: "/dashboard/membros",
    });
  }
  if (ebd) {
    numeros.push({
      icon: BookOpen,
      rotulo: `EBD em ${formatarData(domingo).slice(0, 5)}`,
      valor: ebd.classesComChamada > 0 ? ebd.presentes : "—",
      detalhe:
        ebd.classesComChamada > 0
          ? `presentes de ${ebd.matriculados} matriculados`
          : `chamada não feita · ${ebd.matriculados} matriculados`,
      href: "/dashboard/ebd",
    });
  }
  if (visitas) {
    numeros.push({
      icon: HeartHandshake,
      rotulo: "Pedidos de visita sem contato",
      valor: visitas.novos,
      detalhe: `${visitas.andamento} com visita por fazer · ${visitas.feitas} visitado(s)`,
      href: "/dashboard/relationships",
      atencao: visitas.novos > 0,
    });
  }
  if (oracao !== null) {
    numeros.push({
      icon: HandHeart,
      rotulo: "Pedidos de oração novos",
      valor: oracao,
      detalhe: "desde a sua última visita",
      href: "/dashboard/prayers",
      atencao: oracao > 0,
    });
  }
  if (eventos) {
    const proximo = eventos[0];
    numeros.push({
      icon: CalendarDays,
      rotulo: "Próximos eventos",
      valor: eventos.length,
      detalhe: proximo ? `${proximo.titulo} · ${proximo.inscritos} inscrito(s)` : "nenhum agendado",
      href: "/dashboard/events",
    });
  }
  if (campanhas !== null) {
    numeros.push({
      icon: Megaphone,
      rotulo: "Campanhas ativas",
      valor: campanhas,
      href: "/dashboard/campaigns",
    });
  }
  if (convites) {
    numeros.push({
      icon: MessageCircleHeart,
      rotulo: "Convites pendentes",
      valor: convites.length,
      detalhe: "aguardando resposta",
      href: "/dashboard/membros",
    });
  }

  const atalhos = [
    {
      menu: "prayers",
      icon: HandHeart,
      titulo: "Pedidos de oração",
      descricao: "Acompanhe quem pediu cuidado e retorno da equipe.",
      href: "/dashboard/prayers",
    },
    {
      menu: "events",
      icon: CalendarDays,
      titulo: "Eventos e inscrições",
      descricao: "Organize encontros e veja quem confirmou presença.",
      href: "/dashboard/events",
    },
    {
      menu: "relationships",
      icon: HeartHandshake,
      titulo: "Quem quer visita",
      descricao: "Veja quem pediu uma visita e marque quando for feita.",
      href: "/dashboard/relationships",
    },
    {
      menu: "membros",
      icon: Contact,
      titulo: "Membros",
      descricao: "Cadastro, cargos e aniversariantes da igreja.",
      href: "/dashboard/membros",
    },
    {
      menu: "campaigns",
      icon: Megaphone,
      titulo: "Campanhas",
      descricao: "Crie metas para obras, missões e ações sociais.",
      href: "/dashboard/campaigns",
    },
  ].filter((a) => tem(a.menu));

  const cargos = meusCargos ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ChurchLinkNotices notices={linkNotices ?? []} />

      {primeirosPassos && temPrimeirosPassos(primeirosPassos) ? <PrimeirosPassos dados={primeirosPassos} /> : null}

      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{await nomeCompletoDaIgreja(active.id, active.name)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {cargos.length > 0 ? cargos.join(", ") : PAPEL_LABEL[active.role]}
          {cargos.length > 0 && active.role !== "member" ? ` · ${PAPEL_LABEL[active.role]}` : ""}
        </p>
      </div>

      {numeros.length > 0 ? (
        <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {numeros.map((n) => (
            <Link key={n.rotulo} href={n.href} className="rounded-xl transition-transform hover:-translate-y-0.5">
              <Card className={n.atencao ? "h-full border-amber-500/60" : "h-full"}>
                <CardContent className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{n.rotulo}</p>
                    <p className="mt-1 text-3xl font-semibold tabular-nums">{n.valor}</p>
                    {n.detalhe ? <p className="mt-1 truncate text-xs text-muted-foreground">{n.detalhe}</p> : null}
                  </div>
                  <n.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Você ainda não tem nenhum módulo liberado nesta igreja. Fale com o responsável para receber um cargo com
          acesso.
        </p>
      )}

      {cultos || ebdDomingos ? (
        <section aria-label="Gráficos" className="grid gap-3 lg:grid-cols-2">
          {cultos ? (
            <MiniBarChart
              titulo="Presença nos cultos"
              descricao="Percentual de presença em cada culto com chamada, nas últimas 8 semanas."
              pontos={graficoCultos}
              maximo={100}
              sufixo="%"
              vazio="Nenhuma chamada nas últimas 8 semanas."
            />
          ) : null}
          {ebdDomingos ? (
            <MiniBarChart
              titulo="Presentes na EBD"
              descricao="Alunos presentes em cada um dos últimos 6 domingos."
              pontos={graficoEbd}
              vazio="Nenhuma chamada da EBD nos últimos 6 domingos."
            />
          ) : null}
        </section>
      ) : null}

      {aniversarios ? (
        <AniversariantesCard itens={aniversarios.itens} igreja={aniversarios.igreja} saudacao={saudacao} />
      ) : null}

      {atalhos.length > 0 ? (
        <section aria-label="Atalhos" className="grid gap-3 sm:grid-cols-2">
          {atalhos.map((a) => (
            <Link
              key={a.menu}
              href={a.href}
              className="rounded-xl border bg-background p-4 transition-colors hover:border-primary/35 hover:bg-muted/30"
            >
              <a.icon className="size-5 text-primary" aria-hidden />
              <h3 className="mt-4 text-sm font-semibold">{a.titulo}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{a.descricao}</p>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
