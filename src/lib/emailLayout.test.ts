import { describe, expect, it } from "vitest";
import { escaparHtml, estilizarConteudo, molduraDeEmail, previaDoConteudo } from "./emailLayout";

describe("estilizarConteudo", () => {
  it("parágrafo que só tem um link vira o botão principal", () => {
    const html = estilizarConteudo('<p><a href="https://x.com/aceitar">Aceitar o convite</a></p>');
    expect(html).toContain('<table role="presentation"');
    expect(html).toContain('href="https://x.com/aceitar"');
    expect(html).toContain(">Aceitar o convite</a>");
    expect(html).not.toContain("<p>");
    // O botão tem um estilo só: o de link não pode entrar por cima (texto verde no fundo verde).
    expect(html.match(/<a [^>]*>/)?.[0].match(/style=/g)).toHaveLength(1);
    expect(html).toContain("color:#ffffff");
  });

  it("link no meio do texto continua link, com estilo", () => {
    const html = estilizarConteudo('<p>Se não foi você, <a href="https://x.com/desfazer">desfaça agora</a>.</p>');
    expect(html).not.toContain('role="presentation"');
    expect(html).toMatch(/<a style="color:#[0-9a-f]{6};text-decoration:underline" href="https:\/\/x.com\/desfazer">/);
  });

  it("parágrafos, listas e negrito ganham estilo; o parágrafo de observação fica menor e cinza", () => {
    const html = estilizarConteudo(
      '<p>Olá</p><ul><li>Um</li></ul><p><strong>Nome</strong></p><p style="color:#666;font-size:13px">Obs.</p>',
    );
    expect(html).toContain('<p style="margin:0 0 16px;font-size:15px');
    expect(html).toContain('<ul style="margin:0 0 16px');
    expect(html).toContain('<li style="margin:0 0 6px">');
    expect(html).toContain("<strong style=");
    expect(html).toContain("font-size:13px;line-height:1.5");
  });
});

describe("previaDoConteudo", () => {
  it("tira as tags, desfaz os escapes e corta no limite", () => {
    expect(previaDoConteudo("<p>A paz do Senhor!</p>\n<p><strong>Igreja</strong> &amp; amigos</p>")).toBe(
      "A paz do Senhor! Igreja & amigos",
    );
    expect(previaDoConteudo(`<p>${"a".repeat(200)}</p>`, 20)).toHaveLength(20);
  });
});

describe("molduraDeEmail", () => {
  const html = molduraDeEmail({
    marca: "AssembleiaApp",
    site: "https://www.assembleiaapp.com.br/",
    titulo: "Convite para <a Igreja>",
    conteudo: "<p>Olá</p>",
  });

  it("traz cabeçalho com a marca, título, conteúdo e rodapé com o site", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(">AssembleiaApp</td>");
    expect(html).toContain("Mensagem automática do AssembleiaApp");
    expect(html).toContain('href="https://www.assembleiaapp.com.br"');
    expect(html).toContain(">www.assembleiaapp.com.br</a>");
    expect(html).toContain('<p style="margin:0 0 16px');
  });

  it("escapa o título (que vem do assunto, com nome de igreja digitado por gente)", () => {
    expect(html).toContain("Convite para &lt;a Igreja&gt;");
    expect(html).not.toContain("<a Igreja>");
  });

  it("escaparHtml cobre os caracteres perigosos", () => {
    expect(escaparHtml(`<b a="1">&</b>`)).toBe("&lt;b a=&quot;1&quot;&gt;&amp;&lt;/b&gt;");
  });
});
