/**
 * Moldura visual dos e-mails: cabeçalho com o nome do produto, o conteúdo
 * num cartão branco e um rodapé que diz de onde veio a mensagem.
 *
 * Feita para cliente de e-mail, não para navegador: tabelas e estilo inline
 * (o Gmail e o Outlook ignoram boa parte do CSS em <style>). O conteúdo que
 * chega aqui é o HTML simples que o emailService monta (<p>, <ul>, <a>,
 * <strong>); a moldura dá estilo a ele sem que cada e-mail precise repetir.
 *
 * Função pura, sem I/O. Os modelos do Supabase Auth (supabase/templates)
 * seguem o mesmo desenho, escrito à mão porque usam as variáveis do Supabase.
 */

export const CORES_DO_EMAIL = {
  fundo: "#f3f4ef",
  cartao: "#ffffff",
  borda: "#e3e6dd",
  texto: "#26332a",
  suave: "#6b746d",
  marca: "#41694b",
  marcaTexto: "#ffffff",
  link: "#2f6f45",
} as const;

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Escapa texto para dentro de HTML. */
export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** O botão principal do e-mail, em tabela (é o que renderiza igual no Outlook). */
export function botaoDeEmail(texto: string, url: string): string {
  const c = CORES_DO_EMAIL;
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0">` +
    `<tr><td style="border-radius:8px;background:${c.marca}">` +
    // `style` ANTES de `href`: o estilo genérico de link (em estilizarConteudo)
    // só pega `<a href=`, e não pode sobrescrever a cor do botão.
    `<a style="display:inline-block;padding:13px 24px;font-family:${FONTE};font-size:15px;` +
    `font-weight:600;line-height:1;color:${c.marcaTexto};text-decoration:none;border-radius:8px" href="${url}">${texto}</a>` +
    `</td></tr></table>`
  );
}

/**
 * Dá estilo ao HTML simples do conteúdo:
 * - parágrafo que contém SÓ um link vira o botão principal;
 * - <p>, <ul>, <li>, <a> e <strong> ganham estilo inline (o que já tem
 *   `style` próprio é respeitado).
 */
export function estilizarConteudo(html: string): string {
  const c = CORES_DO_EMAIL;
  return html
    .replace(/<p>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/p>/g, (_, url: string, texto: string) =>
      botaoDeEmail(texto, url),
    )
    .replace(/<p>/g, `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${c.texto}">`)
    .replace(
      /<p style="color:#666;font-size:13px">/g,
      `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:${c.suave}">`,
    )
    .replace(/<ul>/g, `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:${c.texto}">`)
    .replace(/<li>/g, `<li style="margin:0 0 6px">`)
    .replace(/<a href=/g, `<a style="color:${c.link};text-decoration:underline" href=`)
    .replace(/<strong>/g, `<strong style="color:${c.texto}">`);
}

/** Texto curto e sem tags, para a prévia que o cliente de e-mail mostra ao lado do assunto. */
export function previaDoConteudo(html: string, limite = 140): string {
  const texto = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto;
}

export interface MolduraDeEmail {
  /** Nome do produto, no cabeçalho e no rodapé. */
  marca: string;
  /** Endereço do site, no rodapé. */
  site: string;
  /** Vira o título dentro do cartão (normalmente o assunto). */
  titulo: string;
  /** HTML simples do conteúdo (já com o texto do usuário escapado). */
  conteudo: string;
}

/** O e-mail inteiro: documento HTML pronto para enviar. */
export function molduraDeEmail({ marca, site, titulo, conteudo }: MolduraDeEmail): string {
  const c = CORES_DO_EMAIL;
  const inicial = escaparHtml(marca.trim().charAt(0).toUpperCase() || "A");
  const siteLimpo = site.replace(/\/+$/, "");
  const siteVisivel = escaparHtml(siteLimpo.replace(/^https?:\/\//, ""));

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escaparHtml(titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${c.fundo}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escaparHtml(previaDoConteudo(conteudo))}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${c.fundo}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 20px">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="width:36px;height:36px;border-radius:9px;background:${c.marca};color:${c.marcaTexto};font-family:${FONTE};font-size:17px;font-weight:700;text-align:center;vertical-align:middle">${inicial}</td>
<td style="padding-left:10px;font-family:${FONTE};font-size:17px;font-weight:700;color:${c.texto}">${escaparHtml(marca)}</td>
</tr></table>
</td></tr>
<tr><td style="background:${c.cartao};border:1px solid ${c.borda};border-radius:14px;padding:32px 32px 20px;font-family:${FONTE}">
<h1 style="margin:0 0 20px;font-size:21px;line-height:1.35;font-weight:700;color:${c.texto}">${escaparHtml(titulo)}</h1>
${estilizarConteudo(conteudo)}
</td></tr>
<tr><td style="padding:20px 8px 0;font-family:${FONTE};font-size:12px;line-height:1.6;color:${c.suave};text-align:center">
Mensagem automática do ${escaparHtml(marca)}. Este endereço não recebe respostas.<br>
<a href="${siteLimpo}" style="color:${c.suave};text-decoration:underline">${siteVisivel}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
