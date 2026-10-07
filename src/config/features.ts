/**
 * Recursos que existem no sistema mas podem ficar fora das telas.
 *
 * PATROCÍNIO: a função continua ligada (contas, cobrança, área do
 * patrocinador em /patrocinador, moderação), mas por enquanto nada nas telas
 * da igreja nem na página pública remete a ela — a proposta é levada primeiro
 * às igrejas, com a mensalidade. Para voltar a mostrar, defina
 * `NEXT_PUBLIC_PATROCINIO_VISIVEL=true` no ambiente e gere o build de novo.
 *
 * O acesso à variável é estático (`process.env.NOME`) porque este arquivo
 * também roda no navegador, onde o Next só enxerga o que foi escrito assim.
 */
export const features = {
  patrocinioVisivel: process.env.NEXT_PUBLIC_PATROCINIO_VISIVEL === "true",
} as const;
