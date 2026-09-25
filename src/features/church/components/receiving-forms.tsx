"use client";

import { useActionState, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionToast } from "@/hooks/useActionToast";
import {
  setCardEnabledAction,
  submitReceivingRegistrationAction,
  syncReceivingStatusAction,
} from "@/server/actions/churchReceiving";
import {
  cartaoAtivo,
  type ChurchReceivingAccount,
  type ReceivingStatus,
} from "@/services/churchReceivingService";
import { formatCents } from "@/services/sponsorPricing";

const selectClasses =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const ROTULO: Record<ReceivingStatus, string> = {
  nao_iniciado: "Não começou",
  pendente_envio: "Cadastro salvo, não enviado",
  em_analise: "Em análise no provedor",
  aprovada: "Aprovada",
  recusada: "Recusada",
  suspensa: "Suspensa",
};

export interface ReceivingChurch {
  id: string;
  name: string;
  conta: ChurchReceivingAccount | null;
}

/**
 * Cadastro opcional da subconta e o interruptor do cartão.
 *
 * A tela inteira parte de um princípio: PIX sozinho já é um jeito completo de
 * a igreja receber. Isto aqui é um a mais para quem quer cartão, e o texto
 * diz isso — igreja pequena não deve sair daqui achando que está fazendo algo
 * errado por não ter CNPJ.
 */
export function ReceivingForms({ igrejas }: { igrejas: ReceivingChurch[] }) {
  const [state, formAction, pending] = useActionState(submitReceivingRegistrationAction, undefined);
  useActionToast(state);
  const [syncState, syncAction, syncing] = useActionState(syncReceivingStatusAction, undefined);
  useActionToast(syncState);
  const [cardState, cardAction, switching] = useActionState(setCardEnabledAction, undefined);
  useActionToast(cardState);
  const [churchId, setChurchId] = useState(igrejas[0]?.id ?? "");
  const igreja = igrejas.find((i) => i.id === churchId) ?? igrejas[0];
  const conta = igreja?.conta ?? null;
  const [documento, setDocumento] = useState(conta?.documento ?? "");
  const pessoaFisica = documento.replace(/\D/g, "").length === 11;
  const [renda, setRenda] = useState(conta?.rendaMensalCents ? formatCents(conta.rendaMensalCents) : "");
  const [submitting, startTransition] = useTransition();

  // Campos simples de texto, todos controlados: com `defaultValue`, o Base UI
  // acusa "changing the default value state of an uncontrolled FieldControl"
  // assim que o formulário re-renderiza depois de enviar (mesmo sem trocar
  // de valor) — e não renderizar de novo era exatamente o que causava o
  // problema anterior de perder o preenchimento no erro.
  function contaInicial(c: ChurchReceivingAccount | null) {
    return {
      razaoSocial: c?.razaoSocial ?? "",
      nascimento: c?.nascimento ?? "",
      email: c?.email ?? "",
      telefone: c?.telefone ?? "",
      cep: c?.cep ?? "",
      endereco: c?.endereco ?? "",
      enderecoNumero: c?.enderecoNumero ?? "",
      bairro: c?.bairro ?? "",
      cidade: c?.cidade ?? "",
      uf: c?.uf ?? "",
    };
  }
  const [campos, setCampos] = useState(() => contaInicial(conta));
  function campoOnChange(nome: keyof ReturnType<typeof contaInicial>) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setCampos((atual) => ({ ...atual, [nome]: e.target.value }));
  }

  // O React 19 dá form.reset() quando um <form action> termina, apagando tudo
  // o que a pessoa digitou — inclusive quando o servidor recusa (CNPJ
  // inválido, CEP errado etc.). Enviar o FormData numa transition evita o
  // reset. O `action` fica no <form> só para o envio antes da hidratação;
  // depois dela o React ignora o submit já cancelado aqui.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  if (!igreja) return <p className="text-sm text-muted-foreground">Nenhuma igreja nesta conta.</p>;

  const status = conta?.status ?? "nao_iniciado";
  const ativo = conta ? cartaoAtivo(conta) : false;

  return (
    <div className="flex flex-col gap-6">
      {igrejas.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="igrejaRecebimento">Igreja</Label>
          <select
            id="igrejaRecebimento"
            className={selectClasses}
            value={churchId}
            onChange={(e) => {
              const novaConta = igrejas.find((i) => i.id === e.target.value)?.conta ?? null;
              setChurchId(e.target.value);
              setDocumento(novaConta?.documento ?? "");
              setRenda(novaConta?.rendaMensalCents ? formatCents(novaConta.rendaMensalCents) : "");
              setCampos(contaInicial(novaConta));
            }}
          >
            {igrejas.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <ShieldCheck className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-medium">Situação da conta:</span>
        <Badge variant={status === "aprovada" ? "secondary" : "outline"}>{ROTULO[status]}</Badge>
        {conta?.motivoRecusa ? (
          <span className="text-xs text-muted-foreground">{conta.motivoRecusa}</span>
        ) : null}
        {conta?.externalAccountId ? (
          <form action={syncAction} className="ml-auto">
            <input type="hidden" name="churchId" value={igreja.id} />
            <Button type="submit" size="sm" variant="ghost" disabled={syncing}>
              Atualizar situação
            </Button>
          </form>
        ) : null}
      </div>

      {status === "aprovada" ? (
        <form action={cardAction} className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <input type="hidden" name="churchId" value={igreja.id} />
          <input type="hidden" name="aceita" value={ativo ? "false" : "true"} />
          <CreditCard className="size-5 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Cartão/Pix automático na página da igreja: {ativo ? "ligado" : "desligado"}
            </p>
            <p className="text-xs text-muted-foreground">
              Quem doa paga na página do provedor (cartão ou Pix), e o valor cai direto na conta da
              igreja, já descontada a tarifa do Asaas (cartão ~2-3% + R$ 0,49; Pix R$ 0,99 a
              R$ 1,99 por transação). A plataforma não recebe nem retém nada.
            </p>
          </div>
          <Button type="submit" variant={ativo ? "outline" : "default"} disabled={switching}>
            {ativo ? "Desligar cartão" : "Ligar cartão"}
          </Button>
        </form>
      ) : null}

      <form
        action={formAction}
        onSubmit={handleSubmit}
        key={igreja.id}
        className="flex flex-col gap-4 border-t pt-6"
      >
        <input type="hidden" name="churchId" value={igreja.id} />
        <div>
          <h3 className="text-sm font-semibold">Dados para abrir a conta</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            O provedor precisa deles para abrir a conta em nome da igreja. Enquanto ele analisa, a
            página segue funcionando com a chave PIX.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="razaoSocial">Nome da igreja como está no documento</Label>
            <Input
              id="razaoSocial"
              name="razaoSocial"
              required
              value={campos.razaoSocial}
              onChange={campoOnChange("razaoSocial")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="documento">CNPJ ou CPF do responsável</Label>
            <Input
              id="documento"
              name="documento"
              required
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
            />
          </div>
          {pessoaFisica ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nascimento">Nascimento do responsável</Label>
              <Input
                id="nascimento"
                name="nascimento"
                type="date"
                value={campos.nascimento}
                onChange={campoOnChange("nascimento")}
              />
            </div>
          ) : (
            <input type="hidden" name="nascimento" value="" />
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="emailRecebimento">E-mail da tesouraria</Label>
            <Input
              id="emailRecebimento"
              name="email"
              type="email"
              required
              value={campos.email}
              onChange={campoOnChange("email")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="telefoneRecebimento">Telefone com DDD</Label>
            <Input
              id="telefoneRecebimento"
              name="telefone"
              required
              value={campos.telefone}
              onChange={campoOnChange("telefone")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rendaMensal">Renda/faturamento mensal</Label>
            <Input
              id="rendaMensal"
              name="rendaMensal"
              required
              inputMode="decimal"
              placeholder="R$ 0,00"
              value={renda}
              onChange={(e) => {
                const digitos = e.target.value.replace(/\D/g, "");
                setRenda(digitos ? formatCents(Number(digitos)) : "");
              }}
            />
            <p className="text-xs text-muted-foreground">Exigido pelo provedor para abrir a conta.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cep">CEP</Label>
            <Input id="cep" name="cep" required value={campos.cep} onChange={campoOnChange("cep")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enderecoRecebimento">Endereço</Label>
            <Input
              id="enderecoRecebimento"
              name="endereco"
              required
              value={campos.endereco}
              onChange={campoOnChange("endereco")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enderecoNumero">Número</Label>
            <Input
              id="enderecoNumero"
              name="enderecoNumero"
              required
              value={campos.enderecoNumero}
              onChange={campoOnChange("enderecoNumero")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bairro">Bairro</Label>
            <Input
              id="bairro"
              name="bairro"
              required
              value={campos.bairro}
              onChange={campoOnChange("bairro")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cidade">Cidade</Label>
            <Input
              id="cidade"
              name="cidade"
              required
              value={campos.cidade}
              onChange={campoOnChange("cidade")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="uf">UF</Label>
            <Input
              id="uf"
              name="uf"
              required
              maxLength={2}
              value={campos.uf}
              onChange={campoOnChange("uf")}
            />
          </div>
        </div>

        <div>
          <Button
            type="submit"
            disabled={pending || submitting || status === "em_analise" || status === "aprovada"}
          >
            {status === "recusada" ? "Reenviar cadastro" : "Enviar cadastro"}
          </Button>
        </div>
      </form>
    </div>
  );
}
