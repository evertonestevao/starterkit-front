import { Card, CardContent } from "@/components/ui/card";

/** Linha de totais, no topo das telas. */
export function StatCards({ stats }: { stats: Array<{ label: string; value: string }> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent>
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="text-xl font-semibold tracking-tight">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
