import type { ChurchDomainStatus } from "./database";

/**
 * Types do domínio próprio, neutros em relação ao provedor. Nada aqui carrega
 * formato de resposta da Vercel — o adapter traduz antes de devolver.
 */

/** Desafio de posse pedido pelo provedor (TXT), quando exigido. */
export interface DomainVerificationChallenge {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}

/** Um registro que a igreja precisa criar no painel de DNS dela. */
export interface DnsRecordInstruction {
  /** Rótulo exibido na UI ("Tipo", "Nome", "Valor"). */
  type: "A" | "CNAME" | "TXT";
  /** Nome/host do registro: "@" para raiz, "www" para subdomínio. */
  name: string;
  value: string;
  /** Explicação curta em português, exibida junto do registro. */
  hint: string;
}

/** Retorno normalizado do provedor ao consultar um domínio. */
export interface ProviderDomainState {
  /** Provedor confirmou a posse (desafio TXT atendido ou desnecessário). */
  verified: boolean;
  /** DNS ainda não aponta para o provedor. */
  misconfigured: boolean;
  /** Desafios pendentes, quando houver. */
  challenges: DomainVerificationChallenge[];
  /** Motivo legível quando algo travou. Nunca é o corpo cru da API. */
  reason?: string;
}

/** Visão completa do domínio de uma igreja, montada pelo service para a UI. */
export interface ChurchDomainView {
  churchId: string;
  churchName: string;
  /** URL sempre disponível, independente do domínio próprio. */
  defaultUrl: string;
  /** Link que o pastor divulga para conseguir patrocinadores. */
  sponsorInviteUrl: string;
  /** Sede: o domínio próprio vale para a rede inteira (dominio/igreja/{codigo}). */
  networkDomain: boolean;
  domain: string | null;
  status: ChurchDomainStatus;
  supportPaid: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  /** Instruções de DNS; vazio quando não há domínio cadastrado. */
  dns: DnsRecordInstruction[];
  /** URL do domínio próprio quando ativo. */
  customUrl: string | null;
}
