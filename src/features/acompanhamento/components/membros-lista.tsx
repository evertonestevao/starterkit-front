import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SITUACAO_LABEL } from "@/lib/fichaMembro";
import { mascaraTelefone } from "@/lib/telefone";
import type { AcessoMembro, ConvitePendente, RolMembro } from "@/types/acompanhamento";
import type { CargoResumo } from "@/types/cargos";
import { AcessoBadge, ConvidarDialog } from "./acesso-membro";
import { CargosRapido } from "./cargos-rapido";
import { MembroForm } from "./membro-form";

/**
 * Uma página do rol: tabela no desktop, cards no celular. Busca, filtros e
 * paginação ficam fora (MembrosFiltros + PaginationControls, via URL).
 */
export function MembrosLista({
  membros,
  filtrando,
  cargos,
  acessos,
  convites,
  gerenciaAcesso,
  readOnly = false,
  minhaIgrejaId,
  nomesIgrejas,
}: {
  membros: RolMembro[];
  filtrando: boolean;
  /** Cargos disponíveis, para o formulário de edição. */
  cargos: CargoResumo[];
  /** Acesso ao sistema por conta (userId). */
  acessos: Record<string, AcessoMembro>;
  /** Convite pendente por e-mail. */
  convites: Record<string, ConvitePendente>;
  /** Owner/admin: pode convidar para o sistema. */
  gerenciaAcesso: boolean;
  /**
   * Vendo uma unidade ABAIXO na rede (migration 20261022100000): sem editar,
   * convidar nem abrir a ficha — a página dela é só da própria igreja. Mostra
   * e-mail/nascimento quando vierem (cadastro completo), nunca `cuidados`.
   * Ignorado quando `minhaIgrejaId` vem preenchido (decide linha a linha).
   */
  readOnly?: boolean;
  /**
   * "Ver todas": a lista mistura a própria igreja com as de baixo. Cada
   * linha decide sozinha se é editável (a dela) ou só leitura (de baixo),
   * comparando `m.churchId` com este id.
   */
  minhaIgrejaId?: string;
  /** Nome da igreja de cada linha, por churchId — mostra a coluna "Igreja" quando vier. */
  nomesIgrejas?: Record<string, string>;
}) {
  const readOnlyDe = (m: RolMembro) => (minhaIgrejaId ? m.churchId !== minhaIgrejaId : readOnly);
  const acessoDe = (m: RolMembro) => (m.userId ? acessos[m.userId] : undefined);
  const conviteDe = (m: RolMembro) => (m.email ? convites[m.email.toLowerCase()] : undefined);
  /** Ainda sem acesso e sem convite: dá para convidar. */
  const convidavel = (m: RolMembro) => !readOnlyDe(m) && gerenciaAcesso && !acessoDe(m) && !conviteDe(m);
  const Acoes = ({ m }: { m: RolMembro }) => {
    if (readOnlyDe(m)) return null;
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        {convidavel(m) && m.email ? <ConvidarDialog membro={m} /> : null}
        {/* A ficha completa (endereço, família, histórico) fica na página do membro. */}
        <Link
          href={`/dashboard/membros/${m.id}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
          aria-label={`Ver a ficha de ${m.nome}`}
        >
          <ClipboardList className="size-3.5" /> Ver ficha
        </Link>
        <MembroForm membro={m} cargos={cargos} podeConvidar={convidavel(m)} />
      </span>
    );
  };
  const contato = (m: RolMembro) =>
    [mascaraTelefone(m.whatsapp), m.email, m.nascimento ? `nasc. ${m.nascimento.split("-").reverse().join("/")}` : null]
      .filter(Boolean)
      .join(" · ") || null;

  if (membros.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {filtrando ? "Ninguém encontrado." : "Nenhum membro cadastrado ainda."}
      </p>
    );
  }

  return (
    <>
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              {nomesIgrejas ? <TableHead>Igreja</TableHead> : null}
              <TableHead>Cargos</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-72" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {membros.map((m) => {
              const ro = readOnlyDe(m);
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ro ? (
                        <span className="font-medium">{m.nome}</span>
                      ) : (
                        <Link href={`/dashboard/membros/${m.id}`} className="font-medium hover:underline">
                          {m.nome}
                        </Link>
                      )}
                      {!ro ? <AcessoBadge acesso={acessoDe(m)} convite={conviteDe(m)} /> : null}
                      {!m.membroIgreja ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Não membro
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  {nomesIgrejas ? (
                    <TableCell className="text-muted-foreground">{nomesIgrejas[m.churchId] ?? "—"}</TableCell>
                  ) : null}
                  <TableCell>
                    {ro || !gerenciaAcesso ? <CargosDoMembro membro={m} /> : <CargosRapido membro={m} cargos={cargos} />}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {ro ? (contato(m) ?? "—") : mascaraTelefone(m.whatsapp) || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.ativo ? "secondary" : "outline"}>{SITUACAO_LABEL[m.situacao]}</Badge>
                    {m.ativo && !m.participaChamada ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">fora da chamada</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <Acoes m={m} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {membros.map((m) => {
          const ro = readOnlyDe(m);
          const Conteudo = (
            <>
              <p className="flex flex-wrap items-center gap-1.5 font-medium">
                <span className="truncate">{m.nome}</span>
                {!ro ? <AcessoBadge acesso={acessoDe(m)} convite={conviteDe(m)} /> : null}
                {!m.membroIgreja ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Não membro
                  </Badge>
                ) : null}
                {nomesIgrejas ? (
                  <span className="text-xs font-normal text-muted-foreground">· {nomesIgrejas[m.churchId] ?? "—"}</span>
                ) : null}
              </p>
              {/* No cartão, sem cargo não mostra nada (o "—" fica só na tabela). */}
              {(ro || !gerenciaAcesso) && m.cargos.length > 0 ? <CargosDoMembro membro={m} /> : null}
              <p className="text-xs text-muted-foreground">
                {ro
                  ? (contato(m) ?? "Sem contato")
                  : `${mascaraTelefone(m.whatsapp) || "Sem telefone"}${m.ativo ? "" : ` · ${SITUACAO_LABEL[m.situacao]}`}`}
              </p>
            </>
          );
          return (
            <li key={m.id} className="flex flex-col gap-2 rounded-lg border p-3">
              {ro ? (
                <div className="min-w-0">{Conteudo}</div>
              ) : (
                <Link href={`/dashboard/membros/${m.id}`} className="min-w-0">
                  {Conteudo}
                </Link>
              )}
              {/* Fora do link: o atalho de cargo é um botão. */}
              {!ro && gerenciaAcesso ? (
                <div>
                  <CargosRapido membro={m} cargos={cargos} />
                </div>
              ) : null}
              <Acoes m={m} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function CargosDoMembro({ membro }: { membro: RolMembro }) {
  if (membro.cargos.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {membro.cargos.map((c) => (
        <Badge key={c.id} variant="outline" className={c.desativado ? "text-muted-foreground" : ""}>
          {c.nome}
        </Badge>
      ))}
    </span>
  );
}
