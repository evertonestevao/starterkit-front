import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, gerarXlsx, nomeDaColuna, nomeDeAbaValido } from "./xlsx";

/** Lê o zip gerado (sem compressão) e devolve os arquivos dentro. */
function abrirZip(bytes: Uint8Array): Map<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const arquivos = new Map<string, string>();
  let pos = 0;
  while (v.getUint32(pos, true) === 0x04034b50) {
    const metodo = v.getUint16(pos + 8, true);
    const tamanho = v.getUint32(pos + 18, true);
    const nomeLen = v.getUint16(pos + 26, true);
    const nome = new TextDecoder().decode(bytes.slice(pos + 30, pos + 30 + nomeLen));
    const dados = bytes.slice(pos + 30 + nomeLen, pos + 30 + nomeLen + tamanho);
    arquivos.set(nome, new TextDecoder().decode(metodo === 0 ? dados : inflateRawSync(dados)));
    pos += 30 + nomeLen + tamanho;
  }
  return arquivos;
}

describe("xlsx", () => {
  it("crc32 bate com o valor conhecido", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("nomes de coluna e de aba", () => {
    expect([0, 25, 26, 27, 701].map(nomeDaColuna)).toEqual(["A", "Z", "AA", "AB", "ZZ"]);
    expect(nomeDeAbaValido("Pedidos: camiseta/2026?")).toBe("Pedidos  camiseta 2026");
    expect(nomeDeAbaValido("x".repeat(40))).toHaveLength(31);
  });

  it("gera as partes do arquivo, com reais formatados e texto escapado", () => {
    const arquivos = abrirZip(
      gerarXlsx([
        {
          nome: "Pedidos",
          linhas: [
            ["Nome", "Quantidade", "Total"],
            ["Ana & <Bia>", 2, 11000],
          ],
          colunasEmReais: [2],
        },
        { nome: "Pedidos", linhas: [["Opção"]] },
      ]),
    );
    expect([...arquivos.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    const aba = arquivos.get("xl/worksheets/sheet1.xml") ?? "";
    expect(aba).toContain("Ana &amp; &lt;Bia&gt;");
    expect(aba).toContain('<c r="B2"><v>2</v></c>');
    // Centavos viram reais com o estilo de moeda.
    expect(aba).toContain('<c r="C2" s="2"><v>110</v></c>');
    // Aba com nome repetido ganha um número (o Excel não abre nomes iguais).
    expect(arquivos.get("xl/workbook.xml")).toContain('name="Pedidos 2"');
  });
});
