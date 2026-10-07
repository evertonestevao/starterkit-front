import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ModulePlaceholder({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  actions: string[];
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Icon className="size-4" />
          {eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <Card className="border-primary/15 bg-card shadow-sm">
        <CardHeader>
          <CardTitle>Este espaço está pronto para sua igreja</CardTitle>
          <CardDescription>
            Estamos preparando os dados e ações deste módulo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {actions.map((action) => (
            <div
              key={action}
              className="flex items-center gap-3 rounded-xl border bg-muted/25 p-4 text-sm"
            >
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
              <span>{action}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowRight className="size-3.5" />
        Módulo visual em preparação. As integrações entram na próxima etapa.
      </div>
    </div>
  );
}
