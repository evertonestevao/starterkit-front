"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { termosDaBusca } from "@/lib/membrosParecidos";
import { mascaraTelefone } from "@/lib/telefone";
import { cn } from "@/lib/utils";
import { buscarParecidosAction } from "@/server/actions/acompanhamento";
import type { MembroParecido, RolMembro } from "@/types/acompanhamento";

/**
 * "Já existe alguém parecido?" no cadastro novo: enquanto o secretário digita
 * o nome (ou o telefone), mostra quem da igreja já está cadastrado, para não
 * nascer um segundo cadastro da mesma pessoa. É só um aviso: dá para ignorar
 * e salvar.
 */
export function MembrosParecidos({
  nome,
  telefone,
  onEhEstaPessoa,
  onAbrirCadastro,
}: {
  nome: string;
  telefone: string;
  /** Quem ainda não é membro: o formulário passa a completar este cadastro. */
  onEhEstaPessoa: (membro: RolMembro) => void;
  /** Quem já é membro: vai para a ficha dele. */
  onAbrirCadastro: (membro: RolMembro) => void;
}) {
  const [parecidos, setParecidos] = useState<MembroParecido[]>([]);
  const termos = termosDaBusca(nome, telefone);
  const buscando = Boolean(termos.primeiroNome || termos.fimDoTelefone);

  useEffect(() => {
    if (!buscando) return;
    const id = setTimeout(async () => {
      // Falha na busca não atrapalha o cadastro: só não aparece a sugestão.
      const r = await buscarParecidosAction(nome, telefone);
      setParecidos(r.parecidos ?? []);
    }, 350);
    return () => clearTimeout(id);
  }, [buscando, nome, telefone]);

  if (!buscando || parecidos.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
      <p className="text-sm font-medium">Já existe alguém parecido?</p>
      <p className="text-xs text-muted-foreground">
        Se for a mesma pessoa, use o cadastro que já existe em vez de criar outro.
      </p>
      <ul className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-md border bg-background">
        {parecidos.map(({ membro, mesmoTelefone, classeEbd }) => (
          <li
            key={membro.id}
            className="flex flex-col gap-2 px-2.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0">
              <span className="block font-medium break-words">{membro.nome}</span>
              <span className="block text-xs text-muted-foreground">
                {membro.membroIgreja ? "Já é membro" : "Não membro"}
                {classeEbd ? ` · EBD: ${classeEbd}` : ""}
                {!membro.ativo ? " · inativo" : ""}
              </span>
              {membro.whatsapp ? (
                <span
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1 text-xs",
                    mesmoTelefone
                      ? "rounded bg-amber-500/20 px-1.5 py-0.5 font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <Phone className="size-3" /> {mascaraTelefone(membro.whatsapp)}
                  {mesmoTelefone ? " · mesmo telefone" : ""}
                </span>
              ) : null}
            </span>
            {membro.membroIgreja ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="shrink-0 self-start sm:self-auto"
                onClick={() => onAbrirCadastro(membro)}
              >
                Abrir cadastro
              </Button>
            ) : (
              <Button
                type="button"
                size="xs"
                className="shrink-0 self-start sm:self-auto"
                onClick={() => onEhEstaPessoa(membro)}
              >
                É esta pessoa
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
