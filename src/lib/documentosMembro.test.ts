import { describe, expect, it } from "vitest";
import type { IgrejaDoDocumento, MembroDoDocumento, ModeloGravado } from "@/types/secretaria";
import {
  CAMPOS,
  MODELOS_PADRAO,
  NAO_INFORMADO,
  TIPOS_DOCUMENTO,
  camposDesconhecidos,
  camposFaltando,
  camposUsados,
  dataPorExtenso,
  dadosDeExemplo,
  montarDocumento,
  preencher,
  resolverModelos,
  type DadosDoDocumento,
} from "./documentosMembro";

const igreja: IgrejaDoDocumento = {
  nome: "Assembleia de Deus",
  sobrenome: "Lins",
  endereco: "Rua A, 10",
  saudacao: "Graça e paz",
  pastor: "João Pereira",
};
const membro: MembroDoDocumento = {
  nome: "Ana Souza",
  sexo: "feminino",
  nascimento: "1990-05-02",
  estadoCivil: "casado",
  batismo: "2010-08-15",
  membroDesde: "2011-01-09",
  cargos: ["Diaconisa", "Professor(a) da EBD"],
};
const dados = (over: Partial<DadosDoDocumento> = {}): DadosDoDocumento => ({
  membro,
  igreja,
  destino: "Igreja de Bauru",
  hoje: "2026-10-06",
  ...over,
});

describe("campos", () => {
  it("acha os campos do texto, sem repetir", () => {
    expect(camposUsados("{nome} e { nome } de {igreja}")).toEqual(["nome", "igreja"]);
  });

  it("aponta campo que não existe (erro de digitação)", () => {
    expect(camposDesconhecidos("{nome} {nomee} {Igreja} {}")).toEqual(["nomee", "Igreja", ""]);
    expect(camposDesconhecidos("{nome}, {igreja}")).toEqual([]);
  });

  it("os textos padrão só usam campos que existem", () => {
    for (const tipo of TIPOS_DOCUMENTO) {
      const m = MODELOS_PADRAO[tipo];
      expect(camposDesconhecidos(`${m.titulo}\n${m.corpo}`)).toEqual([]);
      expect(m.corpo.length).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("preencher", () => {
  it("troca cada campo pelo dado", () => {
    const texto = preencher(
      "{saudacao} {tratamento} {nome}, {estado_civil}, de {igreja}, batizada em {batismo}, membro desde {membro_desde}, vai para {destino}. {cargos}. {pastor}. {data}",
      dados(),
    );
    expect(texto).toBe(
      "Graça e paz! a irmã Ana Souza, Casado(a), de Assembleia de Deus · Lins, batizada em 15/08/2010, membro desde 09/01/2011, vai para Igreja de Bauru. Diaconisa, Professor(a) da EBD. João Pereira. 6 de outubro de 2026",
    );
  });

  it("tratamento segue o sexo da ficha", () => {
    expect(preencher("{tratamento}", dados({ membro: { ...membro, sexo: "masculino" } }))).toBe("o irmão");
    expect(preencher("{tratamento}", dados({ membro: { ...membro, sexo: null } }))).toBe("o(a) irmão(ã)");
  });

  it("dado que falta vira “não informado”; campo desconhecido fica como está", () => {
    const sem = dados({ membro: { ...membro, batismo: null, cargos: [] }, destino: "  " });
    expect(preencher("{batismo} | {cargos} | {destino} | {inventado}", sem)).toBe(
      `${NAO_INFORMADO} | ${NAO_INFORMADO} | ${NAO_INFORMADO} | {inventado}`,
    );
  });

  it("o nome do membro com chaves não é reinterpretado", () => {
    expect(preencher("{nome}", dados({ membro: { ...membro, nome: "{pastor}" } }))).toBe("{pastor}");
  });
});

describe("camposFaltando", () => {
  it("lista só o que o modelo usa e a ficha não tem", () => {
    const sem = dados({ membro: { ...membro, batismo: null, membroDesde: null, nascimento: null }, destino: null });
    expect(camposFaltando("{nome} {batismo} {destino}", sem)).toEqual([
      "Data do batismo nas águas",
      "Igreja a quem a carta é endereçada",
    ]);
    expect(camposFaltando("{nome} {batismo}", dados())).toEqual([]);
  });
});

describe("montarDocumento", () => {
  it("um parágrafo por bloco separado por linha em branco; quebra simples vira espaço", () => {
    const doc = montarDocumento(
      { tipo: "declaracao", titulo: "Declaração de {nome}", corpo: "Linha um\ncontinua.\n\n\n  Segundo {nome}.  \n" },
      dados(),
    );
    expect(doc.titulo).toBe("Declaração de Ana Souza");
    expect(doc.paragrafos).toEqual(["Linha um continua.", "Segundo Ana Souza."]);
    expect(doc).toMatchObject({
      igreja: "Assembleia de Deus · Lins",
      enderecoIgreja: "Rua A, 10",
      dataExtenso: "6 de outubro de 2026",
      pastor: "João Pereira",
    });
  });

  it("o exemplo preenche tudo, mesmo sem Pastor cadastrado", () => {
    const exemplo = dadosDeExemplo({ ...igreja, pastor: null }, "2026-10-06");
    for (const tipo of TIPOS_DOCUMENTO) {
      const doc = montarDocumento({ tipo, ...MODELOS_PADRAO[tipo] }, exemplo);
      expect(doc.paragrafos.join(" ")).not.toContain(NAO_INFORMADO);
      expect(doc.paragrafos.join(" ")).not.toMatch(/\{[a-z_]+\}/);
      expect(doc.pastor).toBe("Nome do Pastor");
    }
  });
});

describe("resolverModelos", () => {
  const gravado = (over: Partial<ModeloGravado>): ModeloGravado => ({
    tipo: "declaracao",
    titulo: "Da igreja",
    corpo: "Texto da igreja com mais de vinte letras.",
    origemChurchId: "igreja",
    origemNome: "Minha igreja",
    ...over,
  });

  it("sem nada gravado, vale o padrão nos três", () => {
    const m = resolverModelos([], "igreja");
    expect(m.map((x) => [x.tipo, x.origem])).toEqual([
      ["declaracao", "padrao"],
      ["recomendacao", "padrao"],
      ["transferencia", "padrao"],
    ]);
    expect(m[0]!.corpo).toBe(MODELOS_PADRAO.declaracao.corpo);
  });

  it("distingue o texto da própria igreja do herdado da igreja de cima", () => {
    const m = resolverModelos(
      [gravado({}), gravado({ tipo: "transferencia", origemChurchId: "sede", origemNome: "Sede" })],
      "igreja",
    );
    expect(m.find((x) => x.tipo === "declaracao")).toMatchObject({ origem: "propria", origemNome: null });
    expect(m.find((x) => x.tipo === "transferencia")).toMatchObject({ origem: "herdado", origemNome: "Sede" });
    expect(m.find((x) => x.tipo === "recomendacao")!.origem).toBe("padrao");
  });
});

describe("dataPorExtenso", () => {
  it("escreve o mês e usa 1º no primeiro dia", () => {
    expect(dataPorExtenso("2026-10-06")).toBe("6 de outubro de 2026");
    expect(dataPorExtenso("2027-03-01")).toBe("1º de março de 2027");
  });

  it("todo campo da lista tem descrição", () => {
    expect(CAMPOS.every((c) => c.descricao.length > 5)).toBe(true);
  });
});
