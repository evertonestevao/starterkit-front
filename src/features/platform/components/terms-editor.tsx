"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { TermsDocument } from "@/features/terms/components/terms-document";
import { camposPorPreencher, NOME_DO_PUBLICO, TERMOS_MAX_CARACTERES, type PublicoDosTermos } from "@/lib/termos";
import { publicarTermosAction } from "@/server/actions/platform";

/**
 * Editor dos Termos de um público: o texto (Markdown simples) de um lado e,
 * do outro, como ele vai aparecer. Publicar cria a versão seguinte — a
 * anterior fica guardada, e todo mundo aceita de novo no próximo acesso.
 */
export function TermsEditor({
  audience,
  conteudoInicial,
  proximaVersao,
}: {
  audience: PublicoDosTermos;
  conteudoInicial: string;
  proximaVersao: number;
}) {
  const [conteudo, setConteudo] = useState(conteudoInicial);
  const [ciente, setCiente] = useState(false);
  const [pending, startTransition] = useTransition();
  const campos = useMemo(() => camposPorPreencher(conteudo), [conteudo]);
  const mudou = conteudo.trim() !== conteudoInicial.trim();

  // A action é chamada à mão: ao publicar, a página recarrega com o texto novo
  // e este componente é remontado — um toast vindo de useActionState se perderia.
  function publicar() {
    startTransition(async () => {
      const dados = new FormData();
      dados.set("audience", audience);
      dados.set("content", conteudo);
      dados.set("ciente", ciente ? "on" : "");
      const resultado = await publicarTermosAction(undefined, dados);
      if (resultado.error) toast.error(resultado.error);
      else if (resultado.success) toast.success(resultado.success);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Texto</CardTitle>
            <CardDescription>
              Markdown simples: <code>#</code> e <code>##</code> para títulos, <code>**negrito**</code>,{" "}
              <code>- item</code> para listas, <code>[texto](endereço)</code> para links e <code>---</code> para uma
              linha divisória.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <Label htmlFor="termos-conteudo" className="sr-only">
              Texto dos termos
            </Label>
            <textarea
              id="termos-conteudo"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              maxLength={TERMOS_MAX_CARACTERES}
              spellCheck
              className="h-[70vh] min-h-96 w-full resize-y rounded-md border bg-background p-3 font-mono text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Como vai aparecer</CardTitle>
            <CardDescription>
              A linha da versão é acertada sozinha na publicação: será a Versão {proximaVersao}, com a data do dia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[70vh] min-h-96 overflow-y-auto rounded-md border p-4">
              <TermsDocument content={conteudo} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Publicar a Versão {proximaVersao}</CardTitle>
          <CardDescription>
            A versão vigente não é alterada: ela fica guardada no histórico, com os aceites que recebeu, e esta passa a
            valer no lugar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {campos.length > 0 ? (
            <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Ainda há campos de modelo por preencher no texto: {campos.join(", ")}.
            </p>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={ciente}
              onChange={(e) => setCiente(e.target.checked)}
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              Sei que, ao publicar, todas as pessoas do público “{NOME_DO_PUBLICO[audience]}” terão de ler e aceitar os
              termos de novo no próximo acesso.
            </span>
          </label>
          <div>
            <Button type="button" onClick={publicar} disabled={pending || !ciente || !mudou}>
              {pending ? "Publicando..." : `Publicar a Versão ${proximaVersao}`}
            </Button>
            {!mudou ? <span className="ml-3 text-sm text-muted-foreground">O texto está igual ao vigente.</span> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
