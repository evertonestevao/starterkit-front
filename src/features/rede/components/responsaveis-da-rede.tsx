"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { KeyRound, UserMinus } from "lucide-react";
import { confirmar } from "@/components/confirmar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/acompanhamento";
import { nomeNivel, type NomesNiveis } from "@/lib/niveisRede";
import { enviarRecuperacaoAction, removerResponsavelAction } from "@/server/actions/redeCadastro";
import type { ResponsavelDaRede } from "@/services/redeCadastroService";
import { ConvidarResponsavelForm } from "./convidar-responsavel-form";

/**
 * Quem responde por cada igreja abaixo. Só o Responsável de cima vê: trocar
 * (convite que substitui ao ser aceito), remover já, ou mandar o e-mail
 * oficial de nova senha. A senha nunca passa pela igreja de cima.
 */
export function ResponsaveisDaRede({ lista, nomes }: { lista: ResponsavelDaRede[]; nomes: NomesNiveis }) {
  const [pending, startTransition] = useTransition();

  const igrejas = new Map<string, { igreja: string; tipo: ResponsavelDaRede["tipo"]; pessoas: ResponsavelDaRede[] }>();
  for (const r of lista) {
    const g = igrejas.get(r.churchId) ?? {
      igreja: r.igreja,
      tipo: r.tipo,
      pessoas: [],
    };
    g.pessoas.push(r);
    igrejas.set(r.churchId, g);
  }

  function rodar(acao: typeof removerResponsavelAction, memberId: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("memberId", memberId);
      const r = await acao(undefined, fd);
      if (r?.error) toast.error(r.error);
      else if (r?.success) toast.success(r.success);
    });
  }

  if (igrejas.size === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma igreja abaixo tem responsável ainda.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {[...igrejas.entries()].map(([churchId, g]) => (
        <li key={churchId} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{g.igreja}</span>
            <Badge variant="secondary">{nomeNivel(nomes, g.tipo)}</Badge>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {g.pessoas.map((p) => (
              <li key={p.memberId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="truncate">{p.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.email}
                    {p.desde ? ` · desde ${formatarData(p.desde.slice(0, 10))}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={async () => {
                      const sim = await confirmar({
                        titulo: `Enviar e-mail para ${p.nome} criar nova senha?`,
                        descricao: `O e-mail oficial de recuperação vai para ${p.email}. Você não vê nem define a senha.`,
                        botao: "Enviar e-mail",
                      });
                      if (sim) rodar(enviarRecuperacaoAction, p.memberId);
                    }}
                  >
                    <KeyRound className="size-4" /> Nova senha
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={async () => {
                      const ultimo = g.pessoas.length === 1;
                      const sim = await confirmar({
                        titulo: `Remover o acesso de ${p.nome} a ${g.igreja}?`,
                        descricao: ultimo
                          ? "É o único Responsável: a igreja volta a aguardar responsável, os outros acessos dela são encerrados e a mensalidade fica pausada até alguém assumir. O cadastro de membro continua. A pessoa é avisada por e-mail."
                          : "A pessoa perde o acesso agora. O cadastro de membro continua. Ela é avisada por e-mail.",
                        botao: "Remover acesso",
                        perigo: true,
                      });
                      if (sim) rodar(removerResponsavelAction, p.memberId);
                    }}
                  >
                    <UserMinus className="size-4" /> Remover
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-primary">Adicionar ou trocar responsável</summary>
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                A pessoa recebe um link e só vira Responsável quando assumir. Até lá, nada muda na igreja.
              </p>
              <ConvidarResponsavelForm churchId={churchId} igreja={g.igreja} troca />
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
