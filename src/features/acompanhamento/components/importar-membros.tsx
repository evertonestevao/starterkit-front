"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileDown, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData } from "@/lib/acompanhamento";
import {
  CAMPO_IMPORTAVEL_LABEL,
  LIMITE_IMPORTACAO,
  MODELO_CSV,
  lerPlanilhaDeMembros,
  linhasJaCadastradas,
  type LinhaImportada,
  type PlanilhaLida,
} from "@/lib/importarMembros";
import { importarMembrosAction } from "@/server/actions/acompanhamento";
import { textareaClasses } from "./campos";

/** Quantas linhas aparecem na conferência antes de importar. */
const PREVIA = 15;

/**
 * Lê o arquivo no navegador. O Excel em português grava CSV em Windows-1252:
 * se o texto não for UTF-8 válido, lê de novo nessa codificação (senão
 * "João" viraria "Jo�o").
 */
async function lerArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

interface Resultado {
  importados: number;
  ignorados: Array<{ nome: string; motivo: string }>;
}

/**
 * Importação de membros em três passos na mesma tela: trazer a planilha
 * (arquivo ou colar), conferir o que foi entendido, importar.
 */
export function ImportarMembros({
  cadastrados,
}: {
  /** Nome e nascimento de quem a igreja já tem, para avisar os possíveis repetidos. */
  cadastrados: Array<{ nome: string; nascimento: string | null }>;
}) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Resposta para cada possível repetido: é outra pessoa? (linha → true). Sem resposta = é a mesma, não importa.
  const [outraPessoa, setOutraPessoa] = useState<Record<number, boolean>>({});
  const [pending, startTransition] = useTransition();

  const planilha: PlanilhaLida | null = useMemo(() => (texto.trim() ? lerPlanilhaDeMembros(texto) : null), [texto]);
  const validas = useMemo(() => planilha?.linhas.filter((l) => l.erros.length === 0) ?? [], [planilha]);
  const comErro = planilha?.linhas.filter((l) => l.erros.length > 0) ?? [];
  // Repetido = mesmo nome E mesma data de nascimento de alguém já cadastrado ou de uma linha anterior.
  const jaCadastradas = useMemo(() => linhasJaCadastradas(validas, cadastrados), [validas, cadastrados]);
  const repetidas = validas.filter((l) => jaCadastradas.has(l.linha) || l.repeteLinha !== null);
  const ehRepetida = (l: LinhaImportada) => jaCadastradas.has(l.linha) || l.repeteLinha !== null;
  const aImportar = validas.filter((l) => !ehRepetida(l) || outraPessoa[l.linha]);

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2_000_000) {
      toast.error("Arquivo grande demais. Importe até 1000 membros por vez.");
      return;
    }
    setResultado(null);
    setOutraPessoa({});
    setArquivo(f.name);
    setTexto(await lerArquivo(f));
  }

  function importar() {
    startTransition(async () => {
      const r = await importarMembrosAction(
        aImportar.map((l) => ({
          nome: l.nome,
          whatsapp: l.whatsapp,
          email: l.email,
          nascimento: l.nascimento,
          batismo: l.batismo,
          observacoes: l.observacoes,
          // Só vai marcado quem a pessoa conferiu e disse que é outra.
          ...(ehRepetida(l) ? { outraPessoa: true } : {}),
        })),
      );
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(r.success ?? "Importação concluída.");
      setResultado({ importados: r.importados ?? 0, ignorados: r.ignorados ?? [] });
      setTexto("");
      setArquivo(null);
      setOutraPessoa({});
    });
  }

  if (resultado) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-4">
          <p className="text-lg font-semibold">
            {resultado.importados === 1 ? "1 membro importado" : `${resultado.importados} membros importados`}
          </p>
          <p className="text-sm text-muted-foreground">
            Eles já aparecem na lista de membros e na chamada dos cultos. Cargos e acesso ao sistema são dados depois,
            na ficha de cada um.
          </p>
        </div>
        {resultado.ignorados.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{resultado.ignorados.length} não entraram</h3>
            <ul className="flex flex-col divide-y rounded-lg border text-sm">
              {resultado.ignorados.map((i, n) => (
                <li key={`${i.nome}-${n}`} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                  <span className="font-medium">{i.nome}</span>
                  <span className="text-muted-foreground">{i.motivo}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/membros" className={buttonVariants()}>
            Ver os membros
          </Link>
          <Button type="button" variant="outline" onClick={() => setResultado(null)}>
            Importar outra planilha
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">1. Prepare a planilha</h3>
        <p className="text-sm text-muted-foreground">
          A primeira linha tem os títulos das colunas. Só <strong>Nome</strong> é obrigatório; as outras colunas
          aceitas são Telefone, E-mail, Nascimento, Batismo e Observações, em qualquer ordem. Datas no formato
          25/12/1980.
        </p>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${MODELO_CSV}`)}`}
          download="modelo-membros.csv"
          className={`${buttonVariants({ variant: "outline", size: "sm" })} w-fit`}
        >
          <FileDown className="size-4" /> Baixar planilha modelo
        </a>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">2. Traga a planilha</h3>
        <label className={`${buttonVariants({ variant: "outline" })} w-fit`}>
          <Upload className="size-4" /> Escolher arquivo (.csv)
          <input type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={escolherArquivo} />
        </label>
        {arquivo ? <p className="text-xs text-muted-foreground">Arquivo: {arquivo}</p> : null}
        <p className="text-sm text-muted-foreground">
          No Excel: Arquivo → Salvar como → &ldquo;CSV (separado por vírgulas)&rdquo;. Ou selecione as células na
          planilha, copie e cole aqui embaixo:
        </p>
        <textarea
          className={`${textareaClasses} min-h-28 font-mono text-xs`}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setArquivo(null);
            setOutraPessoa({});
          }}
          placeholder={"Nome\tTelefone\tNascimento\nMaria da Silva\t(11) 98888-7777\t25/12/1980"}
          aria-label="Planilha colada"
        />
      </section>

      {planilha ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">3. Confira e importe</h3>
          {planilha.erro ? (
            <p className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">{planilha.erro}</p>
          ) : (
            <>
              <p className="text-sm">
                Colunas reconhecidas: <strong>{planilha.colunas.map((c) => CAMPO_IMPORTAVEL_LABEL[c]).join(", ")}</strong>
                .
                {planilha.ignoradas.length > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    Não usadas: {planilha.ignoradas.join(", ")}.
                  </span>
                ) : null}
              </p>
              <p className="text-sm">
                <strong>{aImportar.length}</strong> {aImportar.length === 1 ? "membro será importado" : "membros serão importados"}
                {repetidas.length > 0 ? (
                  <>
                    , <strong>{repetidas.length}</strong>{" "}
                    {repetidas.length === 1 ? "possível repetido para você conferir" : "possíveis repetidos para você conferir"}
                  </>
                ) : null}
                {comErro.length > 0 ? (
                  <>
                    {" "}
                    e <strong className="text-red-700 dark:text-red-400">{comErro.length} com problema</strong>, que
                    não {comErro.length === 1 ? "entra" : "entram"}
                  </>
                ) : null}
                .
              </p>

              {repetidas.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3">
                  <div>
                    <h4 className="text-sm font-semibold">
                      {repetidas.length === 1 ? "Há 1 registro que parece repetido" : `Há ${repetidas.length} registros que parecem repetidos`}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Têm o mesmo nome e a mesma data de nascimento de alguém que já está cadastrado ou de outra linha
                      da planilha. É a mesma pessoa? Se for, ela não é importada de novo.
                    </p>
                  </div>
                  {repetidas.length > 3 ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setOutraPessoa({})}>
                        Todos são a mesma pessoa
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOutraPessoa(Object.fromEntries(repetidas.map((l) => [l.linha, true])))}
                      >
                        Todos são outras pessoas
                      </Button>
                    </div>
                  ) : null}
                  <ul className="flex flex-col divide-y divide-amber-500/30">
                    {repetidas.map((l) => (
                      <li key={l.linha} className="flex flex-col gap-1.5 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0">
                          <span className="font-medium">{l.nome}</span>
                          <span className="block text-xs text-muted-foreground">
                            Linha {l.linha} · {l.nascimento ? `nascimento ${formatarData(l.nascimento)}` : "sem data de nascimento"} ·{" "}
                            {jaCadastradas.has(l.linha) ? "igual a um membro já cadastrado" : `igual à linha ${l.repeteLinha}`}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col gap-1 sm:flex-row sm:gap-3" role="radiogroup" aria-label={`${l.nome}: é a mesma pessoa?`}>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`rep-${l.linha}`}
                              checked={!outraPessoa[l.linha]}
                              onChange={() => setOutraPessoa((atual) => ({ ...atual, [l.linha]: false }))}
                              className="size-4"
                            />
                            É a mesma pessoa (não importar)
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`rep-${l.linha}`}
                              checked={!!outraPessoa[l.linha]}
                              onChange={() => setOutraPessoa((atual) => ({ ...atual, [l.linha]: true }))}
                              className="size-4"
                            />
                            É outra pessoa (importar)
                          </label>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {comErro.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-lg border border-red-600/30 text-sm">
                  {comErro.slice(0, 30).map((l) => (
                    <li key={l.linha} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
                      <span>
                        Linha {l.linha}
                        {l.nome ? ` · ${l.nome}` : ""}
                      </span>
                      <span className="text-red-700 dark:text-red-400">{l.erros.join("; ")}</span>
                    </li>
                  ))}
                  {comErro.length > 30 ? (
                    <li className="px-3 py-1.5 text-muted-foreground">e mais {comErro.length - 30} linhas com problema</li>
                  ) : null}
                </ul>
              ) : null}

              {aImportar.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Nascimento</TableHead>
                        <TableHead>Batismo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aImportar.slice(0, PREVIA).map((l) => (
                        <TableRow key={l.linha}>
                          <TableCell className="font-medium">{l.nome}</TableCell>
                          <TableCell>{l.whatsapp || "—"}</TableCell>
                          <TableCell>{l.email || "—"}</TableCell>
                          <TableCell>{l.nascimento ? formatarData(l.nascimento) : "—"}</TableCell>
                          <TableCell>{l.batismo ? formatarData(l.batismo) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {aImportar.length > PREVIA ? (
                    <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                      Mostrando os {PREVIA} primeiros de {aImportar.length}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <Button type="button" disabled={pending || aImportar.length === 0} onClick={importar}>
                  {pending
                    ? "Importando..."
                    : aImportar.length === 1
                      ? "Importar 1 membro"
                      : `Importar ${aImportar.length} membros`}
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">Até {LIMITE_IMPORTACAO} membros por planilha.</p>
    </div>
  );
}
