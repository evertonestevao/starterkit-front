"use client";

import { useActionState, useState, type ReactNode } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import {
  ESTADOS_CIVIS,
  ESTADO_CIVIL_LABEL,
  FORMAS_ENTRADA,
  FORMA_ENTRADA_LABEL,
  SEXOS,
  SEXO_LABEL,
  SITUACOES,
  SITUACAO_LABEL,
  UFS,
  mascaraCep,
  temConjuge,
} from "@/lib/fichaMembro";
import { salvarFichaMembroAction } from "@/server/actions/acompanhamento";
import type { ActionState } from "@/server/actions/action-state";
import type { EstadoCivil, FichaMembro, SituacaoMembro } from "@/types/acompanhamento";
import { selectClasses, textareaClasses } from "./campos";

/**
 * Edição da ficha completa do membro, num diálogo dividido em blocos. Nada é
 * obrigatório: a secretaria preenche o que tem e completa depois.
 */
export function FichaForm({
  membroId,
  nome,
  ficha,
  temLogin,
}: {
  membroId: string;
  nome: string;
  ficha: FichaMembro;
  /** Quem tem login continua entrando no sistema mesmo fora do quadro: a tela avisa. */
  temLogin: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [estadoCivil, setEstadoCivil] = useState<EstadoCivil | "">(ficha.estadoCivil ?? "");
  const [situacao, setSituacao] = useState<SituacaoMembro>(ficha.situacao);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await salvarFichaMembroAction(prev, formData);
      if (result.success) setAberto(false);
      return result;
    },
    undefined,
  );
  useActionToast(state);
  const id = (campo: string) => `ficha-${campo}-${membroId}`;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        <ClipboardList className="size-3.5" /> Editar ficha
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ficha de {nome}</DialogTitle>
            <DialogDescription>
              Nada aqui é obrigatório: preencha o que tiver e complete depois. Nome, telefone, nascimento e batismo
              ficam no botão Editar.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="flex flex-col gap-5">
            <input type="hidden" name="membroId" value={membroId} />

            <Bloco titulo="Dados pessoais">
              <Campo rotulo="Sexo" htmlFor={id("sexo")}>
                <select id={id("sexo")} name="sexo" className={selectClasses} defaultValue={ficha.sexo ?? ""}>
                  <option value="">Não informado</option>
                  {SEXOS.map((s) => (
                    <option key={s} value={s}>
                      {SEXO_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Estado civil" htmlFor={id("estadoCivil")}>
                <select
                  id={id("estadoCivil")}
                  name="estadoCivil"
                  className={selectClasses}
                  value={estadoCivil}
                  onChange={(e) => setEstadoCivil(e.target.value as EstadoCivil | "")}
                >
                  <option value="">Não informado</option>
                  {ESTADOS_CIVIS.map((e) => (
                    <option key={e} value={e}>
                      {ESTADO_CIVIL_LABEL[e]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Naturalidade (cidade onde nasceu)" htmlFor={id("naturalidade")}>
                <Input id={id("naturalidade")} name="naturalidade" maxLength={120} defaultValue={ficha.naturalidade ?? ""} />
              </Campo>
              <Campo rotulo="Profissão" htmlFor={id("profissao")}>
                <Input id={id("profissao")} name="profissao" maxLength={120} defaultValue={ficha.profissao ?? ""} />
              </Campo>
            </Bloco>

            <Bloco titulo="Família">
              {temConjuge(estadoCivil || null) ? (
                <>
                  <Campo rotulo="Nome do cônjuge" htmlFor={id("conjugeNome")}>
                    <Input id={id("conjugeNome")} name="conjugeNome" maxLength={120} defaultValue={ficha.conjugeNome ?? ""} />
                  </Campo>
                  <Campo rotulo="Data de casamento" htmlFor={id("dataCasamento")}>
                    <Input id={id("dataCasamento")} name="dataCasamento" type="date" defaultValue={ficha.dataCasamento ?? ""} />
                  </Campo>
                </>
              ) : null}
              <Campo rotulo="Nome do pai" htmlFor={id("paiNome")}>
                <Input id={id("paiNome")} name="paiNome" maxLength={120} defaultValue={ficha.paiNome ?? ""} />
              </Campo>
              <Campo rotulo="Nome da mãe" htmlFor={id("maeNome")}>
                <Input id={id("maeNome")} name="maeNome" maxLength={120} defaultValue={ficha.maeNome ?? ""} />
              </Campo>
              <Campo rotulo="Filhos (nomes)" htmlFor={id("filhos")} largo>
                <textarea
                  id={id("filhos")}
                  name="filhos"
                  className={`${textareaClasses} min-h-16`}
                  maxLength={500}
                  defaultValue={ficha.filhos ?? ""}
                  placeholder="Ex.: Ana (12), Pedro (8)"
                />
              </Campo>
            </Bloco>

            <Bloco titulo="Endereço">
              <Campo rotulo="CEP" htmlFor={id("cep")}>
                <Input
                  id={id("cep")}
                  name="cep"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="00000-000"
                  defaultValue={mascaraCep(ficha.cep)}
                  onChange={(e) => {
                    e.target.value = mascaraCep(e.target.value);
                  }}
                />
              </Campo>
              <Campo rotulo="Rua / avenida" htmlFor={id("logradouro")}>
                <Input id={id("logradouro")} name="logradouro" maxLength={160} defaultValue={ficha.logradouro ?? ""} />
              </Campo>
              <Campo rotulo="Número" htmlFor={id("numero")}>
                <Input id={id("numero")} name="numero" maxLength={20} defaultValue={ficha.numero ?? ""} />
              </Campo>
              <Campo rotulo="Complemento" htmlFor={id("complemento")}>
                <Input id={id("complemento")} name="complemento" maxLength={80} defaultValue={ficha.complemento ?? ""} />
              </Campo>
              <Campo rotulo="Bairro" htmlFor={id("bairro")}>
                <Input id={id("bairro")} name="bairro" maxLength={80} defaultValue={ficha.bairro ?? ""} />
              </Campo>
              <div className="grid grid-cols-[1fr_5.5rem] gap-3">
                <Campo rotulo="Cidade" htmlFor={id("cidade")}>
                  <Input id={id("cidade")} name="cidade" maxLength={80} defaultValue={ficha.cidade ?? ""} />
                </Campo>
                <Campo rotulo="UF" htmlFor={id("uf")}>
                  <select id={id("uf")} name="uf" className={selectClasses} defaultValue={ficha.uf ?? ""}>
                    <option value="">—</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </Bloco>

            <Bloco titulo="Vida na igreja">
              <Campo rotulo="Data de conversão" htmlFor={id("dataConversao")}>
                <Input id={id("dataConversao")} name="dataConversao" type="date" defaultValue={ficha.dataConversao ?? ""} />
              </Campo>
              <Campo rotulo="Membro desde" htmlFor={id("membroDesde")}>
                <Input id={id("membroDesde")} name="membroDesde" type="date" defaultValue={ficha.membroDesde ?? ""} />
              </Campo>
              <Campo rotulo="Como entrou para o quadro de membros" htmlFor={id("entradaForma")}>
                <select
                  id={id("entradaForma")}
                  name="entradaForma"
                  className={selectClasses}
                  defaultValue={ficha.entradaForma ?? ""}
                >
                  <option value="">Não informado</option>
                  {FORMAS_ENTRADA.map((f) => (
                    <option key={f} value={f}>
                      {FORMA_ENTRADA_LABEL[f]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Igreja de origem" htmlFor={id("igrejaOrigem")}>
                <Input id={id("igrejaOrigem")} name="igrejaOrigem" maxLength={160} defaultValue={ficha.igrejaOrigem ?? ""} />
              </Campo>
            </Bloco>

            <Bloco titulo="Situação">
              <Campo rotulo="Situação" htmlFor={id("situacao")}>
                <select
                  id={id("situacao")}
                  name="situacao"
                  className={selectClasses}
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value as SituacaoMembro)}
                >
                  {SITUACOES.map((s) => (
                    <option key={s} value={s}>
                      {SITUACAO_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Campo>
              {situacao !== "ativo" ? (
                <>
                  <Campo rotulo="Desde quando (em branco: hoje)" htmlFor={id("situacaoEm")}>
                    <Input id={id("situacaoEm")} name="situacaoEm" type="date" defaultValue={ficha.situacaoEm ?? ""} />
                  </Campo>
                  <Campo rotulo="Motivo ou observação" htmlFor={id("situacaoMotivo")} largo>
                    <Input
                      id={id("situacaoMotivo")}
                      name="situacaoMotivo"
                      maxLength={300}
                      defaultValue={ficha.situacaoMotivo ?? ""}
                      placeholder="Ex.: mudou-se para outra cidade, carta para a igreja X"
                    />
                  </Campo>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Fora de &quot;Ativo&quot;, a pessoa sai da chamada dos cultos e dos alertas de faltas. O histórico
                    continua guardado.
                    {temLogin
                      ? " Ela tem acesso ao sistema: se não deve mais entrar, remova o acesso nesta mesma página."
                      : ""}
                  </p>
                </>
              ) : null}
            </Bloco>

            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar ficha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 w-full border-b pb-1 text-sm font-medium">{titulo}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Campo({
  rotulo,
  htmlFor,
  largo,
  children,
}: {
  rotulo: string;
  htmlFor: string;
  /** Ocupa as duas colunas. */
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${largo ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={htmlFor}>{rotulo}</Label>
      {children}
    </div>
  );
}
