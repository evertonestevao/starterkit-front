"use client";

import { Formulario } from "@/components/formulario";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardList, Pencil, UserPlus } from "lucide-react";
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
import { TelefoneInput } from "@/components/telefone-input";
import { useActionToast } from "@/hooks/useActionToast";
import { salvarMembroAction } from "@/server/actions/acompanhamento";
import type { ActionState } from "@/server/actions/action-state";
import type { RolMembro } from "@/types/acompanhamento";
import type { CargoResumo } from "@/types/cargos";
import { selectClasses, textareaClasses } from "./campos";
import { palavrasDoNome } from "@/lib/membrosParecidos";
import { MembrosParecidos } from "./membros-parecidos";
import { useTenant } from "@/providers/tenant-provider";
import { permissionService } from "@/services/permissionService";

/**
 * Cadastro e edição de membro do rol, num diálogo. Com `podeConvidar`
 * (owner/admin, pessoa ainda sem acesso nem convite), o e-mail preenchido
 * libera "Convidar para acessar o sistema" — desmarcado por padrão.
 */
export function MembroForm({
  membro: membroParaEditar,
  cargos,
  podeConvidar = false,
  iconOnly = false,
}: {
  membro?: RolMembro;
  cargos: CargoResumo[];
  podeConvidar?: boolean;
  /** Só o lápis, sem o texto "Editar" — para a linha do cartão no celular. */
  iconOnly?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  // Cadastro novo: o que vai sendo digitado alimenta "Já existe alguém parecido?".
  const [digitado, setDigitado] = useState({ nome: "", telefone: "" });
  // "É esta pessoa": em vez de criar outro, o formulário completa o cadastro
  // que já existe (ex.: aluno que a EBD cadastrou só com o primeiro nome).
  const [existente, setExistente] = useState<RolMembro | null>(null);
  // Com o que os campos nascem quando o formulário remonta (valor inicial não pode mudar a cada tecla).
  const [inicial, setInicial] = useState<{ nome: string; whatsapp: string } | null>(null);
  const novo = !membroParaEditar;
  const membro = membroParaEditar ?? existente ?? undefined;
  const router = useRouter();
  // Cargo é acesso ao sistema: só Responsável/Administrador mexe.
  const { active } = useTenant();
  const podeDefinirCargos = permissionService.canManageMembers(active.role);
  const [email, setEmail] = useState(membroParaEditar?.email ?? "");
  const [convidar, setConvidar] = useState(false);
  const [papel, setPapel] = useState<"member" | "admin">("member");
  const emailValido = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState | undefined, formData: FormData): Promise<ActionState> => {
      const result = await salvarMembroAction(prev, formData);
      if (result.success) {
        setAberto(false);
        setConvidar(false);
        if (novo) recomecar();
      }
      // "Salvar e preencher a ficha": o cadastro já existe; segue para a ficha
      // completa dele (mesmo que o convite tenha falhado — o aviso aparece lá).
      if (result.membroId && formData.get("depois") === "ficha") {
        setAberto(false);
        router.push(`/dashboard/membros/${result.membroId}?ficha=1`);
      }
      return result;
    },
    undefined,
  );
  useActionToast(state);
  const id = membro?.id ?? "novo";

  function recomecar() {
    setExistente(null);
    setInicial(null);
    setDigitado({ nome: "", telefone: "" });
    setEmail("");
  }

  function ehEstaPessoa(pessoa: RolMembro) {
    setExistente(pessoa);
    // Fica o nome mais completo: o digitado só substitui o que já existia se tiver mais palavras
    // ("Douglas Silva" no lugar do "Douglas" da EBD, mas não "Ana" no lugar de "Ana Clara Lopes").
    const maisCompleto = palavrasDoNome(digitado.nome).length > palavrasDoNome(pessoa.nome).length;
    setInicial({
      nome: maisCompleto ? digitado.nome.trim() : pessoa.nome,
      whatsapp: digitado.telefone || (pessoa.whatsapp ?? ""),
    });
    if (pessoa.email) setEmail(pessoa.email);
  }

  function naoEhEstaPessoa() {
    setExistente(null);
    setInicial({ nome: digitado.nome, whatsapp: digitado.telefone });
  }

  return (
    <>
      {!novo ? (
        iconOnly ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setAberto(true)}
            aria-label={`Editar ${membro?.nome ?? "membro"}`}
          >
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        )
      ) : (
        <Button type="button" onClick={() => setAberto(true)}>
          <UserPlus className="size-4" /> Novo membro
        </Button>
      )}
      <Dialog
        open={aberto}
        onOpenChange={(abrir) => {
          setAberto(abrir);
          // Fechou sem salvar um cadastro novo: da próxima vez começa em branco.
          if (!abrir && novo) recomecar();
        }}
      >
        {/* Formulário longo: rola dentro da janela em vez de passar da tela. */}
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {existente
                ? `Completar o cadastro de ${existente.nome}`
                : membro
                  ? `Editar ${membro.nome}`
                  : "Novo membro"}
            </DialogTitle>
            <DialogDescription>
              Só o nome é obrigatório. O WhatsApp ajuda a falar com a pessoa quando ela sumir.
              {novo ? " Endereço, família e vida na igreja ficam na ficha completa, no passo seguinte." : ""}
            </DialogDescription>
          </DialogHeader>
          {/* A `key` remonta os campos quando o formulário passa a completar um cadastro que já existe. */}
          <Formulario key={id} action={formAction} estado={state} className="flex flex-col gap-3">
            {membro ? <input type="hidden" name="id" value={membro.id} /> : null}
            {existente ? (
              <div className="flex flex-col items-start gap-1 rounded-md bg-muted/50 p-3 text-sm">
                <p>
                  Você está completando o cadastro que já existia. Não é criado outro: o histórico desta pessoa (EBD,
                  presenças) continua o mesmo.
                </p>
                <button
                  type="button"
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  onClick={naoEhEstaPessoa}
                >
                  Não é esta pessoa: criar um cadastro novo
                </button>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`nome-${id}`}>Nome</Label>
              <Input
                id={`nome-${id}`}
                name="nome"
                defaultValue={novo ? inicial?.nome : membro?.nome}
                onChange={novo ? (e) => setDigitado((d) => ({ ...d, nome: e.target.value })) : undefined}
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`whatsapp-${id}`}>WhatsApp / telefone</Label>
              <TelefoneInput
                id={`whatsapp-${id}`}
                name="whatsapp"
                autoComplete="off"
                defaultValue={novo ? inicial?.whatsapp : membro?.whatsapp}
                onChange={novo ? (e) => setDigitado((d) => ({ ...d, telefone: e.target.value })) : undefined}
              />
            </div>
            {novo && !existente && aberto ? (
              <MembrosParecidos
                nome={digitado.nome}
                telefone={digitado.telefone}
                onEhEstaPessoa={ehEstaPessoa}
                onAbrirCadastro={(pessoa) => {
                  setAberto(false);
                  recomecar();
                  router.push(`/dashboard/membros/${pessoa.id}`);
                }}
              />
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`email-${id}`}>E-mail (opcional)</Label>
              <Input
                id={`email-${id}`}
                name="email"
                type="email"
                placeholder="Para convidar a pessoa ao sistema"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                // Quem já tem login usa o e-mail da conta; trocar aqui não troca o login.
                readOnly={Boolean(membro?.userId)}
              />
              {membro?.userId ? (
                <span className="text-xs text-muted-foreground">É o e-mail do login desta pessoa.</span>
              ) : null}
            </div>
            {podeConvidar && emailValido ? (
              <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
                <input type="hidden" name="convidarComo" value={convidar ? papel : ""} />
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={convidar}
                    onChange={(e) => setConvidar(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Convidar para acessar o sistema
                    <span className="block text-xs text-muted-foreground">
                      Ao salvar, enviamos um convite para este e-mail. Sem marcar, o e-mail fica só como contato.
                    </span>
                  </span>
                </label>
                {convidar ? (
                  <select
                    aria-label="Papel no sistema"
                    className={selectClasses}
                    value={papel}
                    onChange={(e) => setPapel(e.target.value as "member" | "admin")}
                  >
                    <option value="member">Membro — acesso operacional</option>
                    <option value="admin">Administrador — gerencia equipe e configurações</option>
                  </select>
                ) : null}
              </div>
            ) : null}
            <input type="hidden" name="participaEnviado" value="1" />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="membroIgreja"
                // Completar o cadastro de um não membro é justamente recebê-lo como membro.
                defaultChecked={existente ? true : (membro?.membroIgreja ?? true)}
                className="mt-0.5 size-4"
              />
              <span>
                Faz parte do quadro de membros
                <span className="block text-xs text-muted-foreground">
                  Desmarque para congregados e crianças (ex.: aluno da EBD) que a igreja ainda não recebeu como membro.
                </span>
              </span>
            </label>
            {/* Cadastro novo: só o essencial à vista; o resto fica guardado (e segue no envio do formulário). */}
            <details open={!novo || Boolean(existente)} className="group flex flex-col rounded-md border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <span>
                  Mais opções
                  <span className="block text-xs font-normal text-muted-foreground">
                    Nascimento, batismo, observações, cargos e chamada
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-3 border-t p-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`nascimento-${id}`}>Data de nascimento (opcional)</Label>
                  <Input
                    id={`nascimento-${id}`}
                    name="nascimento"
                    type="date"
                    defaultValue={membro?.nascimento ?? ""}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`batismo-${id}`}>Data de batismo (opcional)</Label>
                  <Input id={`batismo-${id}`} name="batismo" type="date" defaultValue={membro?.batismo ?? ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`obs-${id}`}>Observações (opcional)</Label>
                  <textarea
                    id={`obs-${id}`}
                    name="observacoes"
                    className={textareaClasses}
                    defaultValue={membro?.observacoes ?? ""}
                    maxLength={1000}
                  />
                </div>
                {podeDefinirCargos ? (
                  <fieldset className="flex flex-col gap-1.5">
                    <input type="hidden" name="cargosEnviados" value="1" />
                    <legend className="mb-1 text-sm font-medium">Cargos</legend>
                    <p className="text-xs text-muted-foreground">
                      Os cargos definem o que a pessoa acessa no sistema (Configurações → Acessos). Com mais de um
                      cargo, ela soma os acessos de todos.
                    </p>
                    <CargosCheckboxes membro={membro} cargos={cargos} />
                  </fieldset>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Cargos:{" "}
                    {membro && membro.cargos.length > 0 ? membro.cargos.map((c) => c.nome).join(", ") : "nenhum"}. Só
                    quem administra a igreja altera os cargos, porque eles definem o acesso ao sistema.
                  </p>
                )}
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="participaChamada"
                    defaultChecked={membro?.participaChamada ?? true}
                    className="mt-0.5 size-4"
                  />
                  <span>
                    Participa da chamada dos cultos
                    <span className="block text-xs text-muted-foreground">
                      Marca presença e falta nos cultos (a chamada da EBD é separada, pela matrícula na classe).
                      Desmarque para quem só administra o sistema (ex.: contador): não aparece na chamada dos cultos nem
                      nos alertas de faltas.
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="ativo" defaultChecked={membro?.ativo ?? true} className="size-4" />
                  Ativo (inativo não aparece na chamada nem gera alerta)
                </label>
              </div>
            </details>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              {/* Só no cadastro novo: quem já existe tem "Editar ficha" na própria página. */}
              {novo ? (
                <Button type="submit" name="depois" value="ficha" variant="outline" disabled={pending}>
                  <ClipboardList className="size-3.5" /> Salvar e preencher a ficha
                </Button>
              ) : null}
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </Formulario>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Um quadradinho por cargo disponível. Cargo desativado que a pessoa já tinha
 * aparece (marcado) para ela poder manter ou tirar; não aparece para os outros.
 */
function CargosCheckboxes({ membro, cargos }: { membro?: RolMembro; cargos: CargoResumo[] }) {
  const tem = new Set(membro?.cargos.map((c) => c.id) ?? []);
  const antigos = (membro?.cargos ?? []).filter((c) => !cargos.some((d) => d.id === c.id));
  const opcoes = [...cargos, ...antigos];
  if (opcoes.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum cargo cadastrado. Crie em Configurações → Cargos.</p>;
  }
  return (
    <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
      {opcoes.map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="cargoIds" value={c.id} defaultChecked={tem.has(c.id)} className="size-4" />
          <span className={c.desativado ? "text-muted-foreground" : ""}>
            {c.nome}
            {c.desativado ? " (desativado)" : ""}
          </span>
        </label>
      ))}
    </div>
  );
}
