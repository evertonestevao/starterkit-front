/**
 * Em que pé está a chave Pix própria da igreja. A chave só aparece na página
 * pública depois que a moderação da plataforma aprova; trocar a chave volta
 * para "aguardando". Sem I/O.
 */

export type PixStatus = "sem_chave" | "aguardando" | "aprovado" | "recusado";

export interface PixAprovacao {
  chave: string | null;
  aprovadoEm: string | null;
  recusadoEm: string | null;
}

export function statusDoPix(pix: PixAprovacao): PixStatus {
  if (!pix.chave) return "sem_chave";
  if (pix.aprovadoEm) return "aprovado";
  if (pix.recusadoEm) return "recusado";
  return "aguardando";
}

export const PIX_STATUS_LABEL: Record<PixStatus, string> = {
  sem_chave: "Não cadastrado",
  aguardando: "Aguardando aprovação",
  aprovado: "Aprovado",
  recusado: "Recusado",
};

/** O que a pessoa precisa saber sobre o estado da chave dela. */
export function explicarPixStatus(status: PixStatus, motivoRecusa?: string | null): string {
  switch (status) {
    case "sem_chave":
      return "Opcional. Com a chave cadastrada e aprovada, a página mostra o Pix e o QR Code para dízimos e ofertas.";
    case "aguardando":
      return "Recebemos a chave. Ela aparece na página assim que a nossa equipe conferir — é uma proteção contra páginas falsas. Enquanto isso, o Pix não é mostrado.";
    case "aprovado":
      return "A chave está na página da igreja. Se você trocar a chave ou o titular, ela volta para conferência antes de aparecer de novo.";
    case "recusado":
      return `A chave não foi aprovada${motivoRecusa ? `: ${motivoRecusa}` : "."} Corrija os dados e salve de novo para enviar para conferência.`;
  }
}
