import type { ChurchTipo } from "@/types/database";

/**
 * Vínculo entre igrejas. A igreja SUPERIOR gera um link e o manda aos pastores
 * das igrejas que ficarão abaixo dela; quem abre o link decide se quer pedir o
 * vínculo, e a superior aprova ou recusa o pedido. A árvore só muda na
 * aprovação.
 */

/** Posição que a igreja de baixo vai ocupar. */
export type ChurchLinkTipo = "subsede" | "congregacao";

/** `expirado` e `esgotado` não existem na tabela: o banco os calcula na leitura. */
export type ChurchLinkInviteStatus = "ativo" | "revogado" | "expirado" | "esgotado";

export type ChurchLinkRequestStatus =
  | "pendente"
  | "aprovado"
  | "recusado"
  | "cancelado"
  | "encerrado";

export interface ChurchLinkNode {
  id: string;
  name: string;
  sobrenome: string | null;
  tipo: ChurchTipo;
  publicCode: string;
}

/** Igreja da empresa ativa, com o que decide o que ela pode fazer na árvore. */
export interface ChurchLinkChurch extends ChurchLinkNode {
  parentId: string | null;
}

/** Um link gerado pela igreja superior. */
export interface ChurchLinkInvite {
  id: string;
  tipoSubordinada: ChurchLinkTipo;
  status: ChurchLinkInviteStatus;
  /** null = o link não expira. */
  expiresAt: string | null;
  /** null = sem limite de pedidos. */
  maxUses: number | null;
  /** Pedidos já gerados por este link (cancelados também contam). */
  uses: number;
  createdAt: string;
}

/** Um pedido de vínculo, do ponto de vista de quem o vê (a superior ou a de baixo). */
export interface ChurchLinkRequest {
  id: string;
  status: ChurchLinkRequestStatus;
  tipoSolicitado: ChurchLinkTipo;
  tipoFinal: ChurchLinkTipo | null;
  motivoRecusa: string | null;
  requestedAt: string;
  decidedAt: string | null;
  parentChurchId: string;
  childChurchId: string;
  /** Nomes completos (nome + sobrenome). */
  parentName: string;
  childName: string;
  childAddress: string | null;
  childPublicCode: string | null;
  /** Quem fez o pedido, para a superior reconhecer o pastor. */
  solicitanteNome: string | null;
}

/** O que a pessoa vê ao abrir o link. */
export interface ChurchLinkPreview {
  inviteId: string;
  tipoSubordinada: ChurchLinkTipo;
  status: ChurchLinkInviteStatus;
  expiresAt: string | null;
  /** O link é de uma igreja da própria pessoa. */
  isMine: boolean;
  church: {
    id: string;
    name: string;
    sobrenome: string | null;
    address: string | null;
    tipo: ChurchTipo;
    publicCode: string;
  };
}

export interface ChurchLinkRequested {
  parentCompanyId: string;
  parentChurchName: string;
  childChurchName: string;
  tipo: ChurchLinkTipo;
}

export interface ChurchLinkDecision {
  childCompanyId: string;
  parentChurchName: string;
  childChurchName: string;
  tipo: ChurchLinkTipo;
  approved: boolean;
}

export interface ChurchLinkMoved {
  /** Empresa da igreja movida, a avisar; null quando a mesma equipe cuida dos dois lados. */
  childCompanyId: string | null;
  childChurchName: string;
  parentChurchName: string;
  tipo: ChurchLinkTipo;
}

export interface ChurchLinkEnded {
  /** Empresa que precisa ser avisada; null quando os dois lados são a mesma empresa. */
  otherCompanyId: string | null;
  otherChurchName: string;
  ownChurchName: string;
}

export type ChurchLinkNoticeKind = "pedido" | "aprovado" | "recusado" | "movida" | "encerrado";

export interface ChurchLinkNotice {
  id: string;
  kind: ChurchLinkNoticeKind;
  outraIgrejaNome: string;
  /** Motivo da recusa, ou a nova posição numa mudança. */
  detalhe: string | null;
  createdAt: string;
}
