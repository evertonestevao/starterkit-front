"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AcessoMembro, ConvitePendente, RolMembro } from "@/types/acompanhamento";
import { AcessoMembroCard, PAPEL_LABEL } from "./acesso-membro";
import { ConvitesSemMembro } from "./convites-sem-membro";

type Pessoa = { membro: RolMembro; acesso?: AcessoMembro; convite?: ConvitePendente };

const ORDEM_PAPEL = { owner: 0, admin: 1, member: 2 } as const;

/**
 * Quem entra no sistema, num lugar só: papel, cargos e convites pendentes.
 * "Gerenciar" abre o mesmo cartão de acesso da ficha do membro.
 */
export function QuemAcessa({
  pessoas,
  convitesSemMembro,
}: {
  pessoas: Pessoa[];
  convitesSemMembro: ConvitePendente[];
}) {
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const termo = busca.trim().toLowerCase();
  const lista = pessoas
    .filter(
      (p) =>
        !termo || p.membro.nome.toLowerCase().includes(termo) || (p.membro.email ?? "").toLowerCase().includes(termo),
    )
    .sort(
      (a, b) =>
        (a.acesso ? ORDEM_PAPEL[a.acesso.role] : 3) - (b.acesso ? ORDEM_PAPEL[b.acesso.role] : 3) ||
        a.membro.nome.localeCompare(b.membro.nome, "pt-BR"),
    );
  const comAcesso = pessoas.filter((p) => p.acesso).length;
  const pendentes = pessoas.length - comAcesso + convitesSemMembro.length;
  const selecionada = pessoas.find((p) => p.membro.id === aberta);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quem acessa o sistema</CardTitle>
        <CardDescription>
          {comAcesso} {comAcesso === 1 ? "pessoa entra" : "pessoas entram"} no sistema
          {pendentes > 0 ? ` · ${pendentes} ${pendentes === 1 ? "convite pendente" : "convites pendentes"}` : ""}. O
          acesso é sempre de um membro: para convidar alguém novo, abra a pessoa em{" "}
          <Link href="/dashboard/membros" className="font-medium text-primary underline underline-offset-4">
            Membros
          </Link>
          . O que cada um usa vem do papel e dos cargos (Configurações → Acessos).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar por nome ou e-mail"
        />

        {lista.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {pessoas.length === 0 ? "Ninguém com acesso ainda." : "Ninguém encontrado."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {lista.map((p) => (
              <li
                key={p.membro.id}
                className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{p.membro.nome}</span>
                    {p.acesso ? (
                      <Badge variant={p.acesso.role === "member" ? "secondary" : "default"}>
                        {PAPEL_LABEL[p.acesso.role]}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Convite pendente</Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.membro.email ?? p.convite?.email ?? "Sem e-mail"}
                    {p.membro.cargos.length > 0 ? ` · ${p.membro.cargos.map((c) => c.nome).join(", ")}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="self-start sm:self-auto"
                  onClick={() => setAberta(p.membro.id)}
                >
                  <Settings2 className="size-3.5" /> Gerenciar
                </Button>
              </li>
            ))}
          </ul>
        )}

        {convitesSemMembro.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Convites para quem ainda não está em Membros</p>
            <ConvitesSemMembro convites={convitesSemMembro} />
          </div>
        ) : null}
      </CardContent>

      <Dialog open={!!selecionada} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selecionada?.membro.nome}</DialogTitle>
          </DialogHeader>
          {selecionada ? (
            <AcessoMembroCard membro={selecionada.membro} acesso={selecionada.acesso} convite={selecionada.convite} />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
