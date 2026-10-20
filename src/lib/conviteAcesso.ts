/**
 * Mensagem do convite de acesso que vai pelo WhatsApp. O WhatsApp transforma
 * e-mail e endereço em link: cada um vai na própria linha, para a pessoa não
 * confundir um com o outro.
 */
export function mensagemDoConviteDeAcesso(input: {
  saudacao: string;
  igreja: string;
  email: string;
  url: string;
  /** Data-hora ISO em que o convite vence. */
  expiraEm?: string | null;
}): string {
  const validade = input.expiraEm
    ? new Date(input.expiraEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;
  return [
    `${input.saudacao} A ${input.igreja} convidou você para acessar o sistema da igreja.`,
    "",
    "1. Toque no link abaixo.",
    "2. Entre ou crie a senha usando este e-mail:",
    input.email,
    "",
    validade ? `Link do convite (vale até ${validade}):` : "Link do convite:",
    input.url,
  ].join("\n");
}
