import { describe, expect, it } from "vitest";
import {
  detectarSeparador,
  lerData,
  lerDelimitado,
  lerPlanilhaDeMembros,
  linhasJaCadastradas,
  MODELO_CSV,
} from "./importarMembros";

describe("lerDelimitado", () => {
  it("lê CSV do Excel em português (ponto e vírgula, BOM, CRLF) e ignora linhas vazias", () => {
    const texto = "﻿Nome;Telefone\r\nAna;11 98888-7777\r\n;\r\n\r\nBeto;\r\n";
    expect(lerDelimitado(texto, detectarSeparador("Nome;Telefone"))).toEqual([
      ["Nome", "Telefone"],
      ["Ana", "11 98888-7777"],
      ["Beto", ""],
    ]);
  });

  it("respeita aspas: separador e quebra de linha dentro da célula, e aspa dobrada", () => {
    expect(lerDelimitado('Nome,Obs\n"Silva, Ana","disse ""amém""\nduas linhas"', ",")).toEqual([
      ["Nome", "Obs"],
      ["Silva, Ana", 'disse "amém"\nduas linhas'],
    ]);
  });

  it("colado da planilha vem com tabulação", () => {
    expect(detectarSeparador("Nome\tTelefone, fixo")).toBe("\t");
    expect(detectarSeparador("Nome,Telefone")).toBe(",");
  });
});

describe("lerData", () => {
  it("aceita dd/mm/aaaa, dd-mm-aa e aaaa-mm-dd", () => {
    expect(lerData("25/12/1980")).toBe("1980-12-25");
    expect(lerData("5.3.2010")).toBe("2010-03-05");
    expect(lerData("2001-07-09")).toBe("2001-07-09");
    expect(lerData("")).toBe("");
  });

  it("ano de dois dígitos: até o ano atual é 20xx, depois 19xx", () => {
    expect(lerData("01/02/15", 2026)).toBe("2015-02-01");
    expect(lerData("01/02/80", 2026)).toBe("1980-02-01");
  });

  it("recusa data que não existe, texto e ano no futuro", () => {
    expect(lerData("31/02/2000")).toBeNull();
    expect(lerData("dezembro")).toBeNull();
    expect(lerData("01/01/2090", 2026)).toBeNull();
  });
});

describe("lerPlanilhaDeMembros", () => {
  it("acha as colunas pelo título, em qualquer ordem, caixa ou acento", () => {
    const lida = lerPlanilhaDeMembros(
      "CELULAR;Nome Completo;Data de Nascimento;Endereço\n(11) 98888-7777;  Ana   Lima ;25/12/1980;Rua A\n",
    );
    expect(lida.erro).toBeNull();
    expect(lida.colunas).toEqual(["whatsapp", "nome", "nascimento"]);
    expect(lida.ignoradas).toEqual(["Endereço"]);
    expect(lida.linhas[0]).toMatchObject({
      linha: 2,
      nome: "Ana Lima",
      whatsapp: "(11) 98888-7777",
      nascimento: "1980-12-25",
      erros: [],
    });
  });

  it("aponta o problema de cada linha, com o número dela", () => {
    const lida = lerPlanilhaDeMembros(
      ["Nome;Telefone;E-mail;Nascimento", ";11988887777;;", "Beto;9999;beto@;40/01/2000", "Carla;;;"].join("\n"),
    );
    expect(lida.linhas.map((l) => [l.linha, l.erros])).toEqual([
      [2, ["sem nome"]],
      [3, ["telefone sem DDD", "e-mail inválido", "data de nascimento inválida"]],
      [4, []],
    ]);
  });

  it("homônimos entram; só mesmo nome E mesmo nascimento vira pergunta de repetido", () => {
    const lida = lerPlanilhaDeMembros(
      [
        "Nome;Nascimento",
        "José da Silva;10/01/1950", // pai
        "José da Silva;22/08/1978", // filho: outro nascimento, entra normal
        "JOSE DA SILVA;10/01/1950", // igual à linha 2: pergunta
        "Maria;",
        "maria;", // sem data nos dois: também pergunta
      ].join("\n"),
    );
    expect(lida.linhas.map((l) => [l.linha, l.erros.length, l.repeteLinha])).toEqual([
      [2, 0, null],
      [3, 0, null],
      [4, 0, 2],
      [5, 0, null],
      [6, 0, 5],
    ]);
  });

  it("acha quem já está cadastrado pelo nome com o mesmo nascimento", () => {
    const lida = lerPlanilhaDeMembros(["Nome;Nascimento", "Glória Pires;05/05/1970", "Glória Pires;01/01/1990", "Ana;"].join("\n"));
    const cadastrados = [
      { nome: "GLORIA PIRES", nascimento: "1970-05-05" },
      { nome: "Ana", nascimento: null },
    ];
    expect([...linhasJaCadastradas(lida.linhas, cadastrados)]).toEqual([2, 4]);
  });

  it("sem coluna de nome, vazia ou só com o título: erro da planilha inteira", () => {
    expect(lerPlanilhaDeMembros("Telefone;E-mail\n1;2").erro).toMatch(/coluna "Nome"/);
    expect(lerPlanilhaDeMembros("  ").erro).toMatch(/vazia/);
    expect(lerPlanilhaDeMembros("Nome;Telefone").erro).toMatch(/pelo menos um membro/);
  });

  it("recusa planilha acima do limite", () => {
    const grande = ["Nome", ...Array.from({ length: 1001 }, (_, i) => `Pessoa ${i}`)].join("\n");
    expect(lerPlanilhaDeMembros(grande).erro).toMatch(/até 1000 por vez/);
  });

  it("o modelo oferecido para baixar é lido sem erro", () => {
    const lida = lerPlanilhaDeMembros(MODELO_CSV);
    expect(lida.colunas).toEqual(["nome", "whatsapp", "email", "nascimento", "batismo", "observacoes"]);
    expect(lida.linhas[0].erros).toEqual([]);
    expect(lida.linhas[0].batismo).toBe("2005-06-10");
  });
});
