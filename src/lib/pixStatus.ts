/**
 * Em que pé está a chave Pix própria da igreja. A chave só aparece na página
 * pública depois que o Responsável confirma pelo link enviado ao e-mail dele;
 * trocar a chave volta para "aguardando". Sem I/O.
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
  aguardando: "Aguardando confirmação por e-mail",
  aprovado: "Confirmado",
  recusado: "Recusado",
};

/** O que a pessoa precisa saber sobre o estado da chave dela. */
export function explicarPixStatus(status: PixStatus, motivoRecusa?: string | null): string {
  switch (status) {
    case "sem_chave":
      return "Opcional. Com a chave cadastrada e confirmada, a página mostra o Pix e o QR Code para dízimos e ofertas.";
    case "aguardando":
      return "Enviamos um link de confirmação para o e-mail do Responsável pela igreja. A chave aparece na página assim que ele abrir o link e confirmar — é o que impede alguém de trocar a chave sozinho. Enquanto isso, o Pix não é mostrado.";
    case "aprovado":
      return "A chave está na página da igreja. Se você trocar a chave ou o titular, o Responsável precisa confirmar de novo pelo e-mail antes de ela aparecer.";
    case "recusado":
      return `A chave foi recusada pela plataforma${motivoRecusa ? `: ${motivoRecusa}` : "."} Corrija os dados e salve de novo.`;
  }
}
