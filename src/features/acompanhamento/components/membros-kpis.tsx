import Link from "next/link";
import { AlertTriangle, BadgeCheck, Cake, ChartNoAxesCombined, UserPlus, Users } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import type { MembrosKpis } from "@/types/acompanhamento";

/**
 * Faixa de indicadores no topo de Membros. Reaproveita o MetricCard do
 * dashboard; "Em alerta" leva direto à lista de quem precisa de contato.
 */
export function MembrosKpisFaixa({ kpis }: { kpis: MembrosKpis }) {
  const percentualCargo = kpis.ativos > 0 ? Math.round((kpis.comCargo / kpis.ativos) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <MetricCard
        icon={Users}
        label="Membros ativos"
        value={kpis.ativos}
        hint={
          [
            kpis.inativos > 0 ? `+ ${kpis.inativos} inativo${kpis.inativos === 1 ? "" : "s"}` : null,
            kpis.naoMembros > 0 ? `+ ${kpis.naoMembros} não membro${kpis.naoMembros === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "do quadro de membros"
        }
      />
      <MetricCard icon={UserPlus} label="Novos no mês" value={kpis.novosNoMes} hint="cadastrados este mês" />
      <MetricCard
        icon={Cake}
        label="Aniversariantes"
        value={kpis.aniversariantesDoMes}
        hint="fazem aniversário este mês"
      />
      <MetricCard icon={BadgeCheck} label="Com cargo" value={kpis.comCargo} hint={`${percentualCargo}% dos ativos`} />
      <MetricCard
        icon={ChartNoAxesCombined}
        label="Presença média"
        value={kpis.presencaMedia === null ? "—" : `${kpis.presencaMedia.toLocaleString("pt-BR")}%`}
        hint="últimas 8 semanas"
      />
      <Link
        href="/dashboard/acompanhamento/alertas"
        className="rounded-xl transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={`${kpis.emAlerta} membros em alerta — ver lista`}
      >
        <MetricCard icon={AlertTriangle} label="Em alerta" value={kpis.emAlerta} hint="faltas seguidas · ver lista" />
      </Link>
    </div>
  );
}
