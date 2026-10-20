import { describe, expect, it } from "vitest";
import { fichaVazia } from "@/lib/fichaMembro";
import type { Aniversario, RolMembro } from "@/types/acompanhamento";
import {
  celulaCsv,
  descreverAnos,
  descreverQuando,
  proximosAniversarios,
  lerFiltroQuadro,
  lerFiltroSituacao,
  lerMes,
  membrosParaCsv,
  mensagemParabens,
  ordenarAniversarios,
} from "./rolMembros";

const membro = (over: Partial<RolMembro> = {}): RolMembro => ({
  id: "m1",
  churchId: "c1",
  nome: "Ana Lima",
  cargos: [{ id: "g1", nome: "Diácono", ordem: 1, desativado: false }],
  whatsapp: "11999998888",
  email: "ana@igreja.org",
  userId: null,
  participaChamada: true,
  membroIgreja: true,
  cuidados: null,
  nascimento: "1990-10-05",
  batismo: null,
  ativo: true,
  situacao: "ativo",
  observacoes: null,
  ...over,
});

const aniversario = (over: Partial<Aniversario> = {}): Aniversario => ({
  membroId: "m1",
  nome: "Ana Lima",
  whatsapp: null,
  tipo: "nascimento",
  data: "1990-10-05",
  dia: 5,
  conjugeNome: null,
  ...over,
});

describe("filtros da URL", () => {
  it("situação: sem nada ou com lixo, só os ativos", () => {
    expect(lerFiltroSituacao(undefined)).toBe("ativo");
    expect(lerFiltroSituacao("xpto")).toBe("ativo");
    expect(lerFiltroSituacao("todas")).toBe("todas");
    expect(lerFiltroSituacao("falecido")).toBe("falecido");
  });

  it("quadro: só os valores conhecidos", () => {
    expect(lerFiltroQuadro("membros")).toBe("membros");
    expect(lerFiltroQuadro("nao_membros")).toBe("nao_membros");
    expect(lerFiltroQuadro("qualquer")).toBe("todos");
  });

  it("mês: 1 a 12, senão o de hoje", () => {
    expect(lerMes("3", "2026-10-06")).toBe(3);
    expect(lerMes("13", "2026-10-06")).toBe(10);
    expect(lerMes(undefined, "2026-02-01")).toBe(2);
    expect(lerMes("1.5", "2026-10-06")).toBe(10);
  });
});

describe("celulaCsv", () => {
  it("põe aspas quando há ponto e vírgula ou aspas, e junta as linhas", () => {
    expect(celulaCsv("Ana")).toBe("Ana");
    expect(celulaCsv("Rua A; casa 2")).toBe('"Rua A; casa 2"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaCsv("linha 1\nlinha 2")).toBe("linha 1 linha 2");
    expect(celulaCsv(null)).toBe("");
  });

  it("neutraliza o que a planilha executaria como fórmula", () => {
    expect(celulaCsv("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(celulaCsv("+55 11 99999")).toBe("'+55 11 99999");
    expect(celulaCsv("-1+1")).toBe("'-1+1");
    expect(celulaCsv("@cmd")).toBe("'@cmd");
  });
});

describe("membrosParaCsv", () => {
  it("sem a ficha: só as colunas da lista, com BOM e ponto e vírgula", () => {
    const csv = membrosParaCsv([membro()], {}, false);
    expect(csv.startsWith("﻿")).toBe(true);
    const [cabecalho, linha] = csv.slice(1).trim().split("\r\n");
    expect(cabecalho).toBe("Nome;Situação;Quadro;Cargos;WhatsApp;E-mail;Nascimento;Batismo");
    expect(linha).toBe("Ana Lima;Ativo;Membro;Diácono;(11) 99999-8888;ana@igreja.org;05/10/1990;");
  });

  it("com a ficha: endereço, família e situação entram; quem não tem ficha fica em branco", () => {
    const ficha = { ...fichaVazia(true), cidade: "Bauru", uf: "SP", cep: "17012345", estadoCivil: "casado" as const };
    const csv = membrosParaCsv(
      [membro(), membro({ id: "m2", nome: "Beto", situacao: "transferido", membroIgreja: false })],
      { m1: ficha },
      true,
    );
    const linhas = csv.slice(1).trim().split("\r\n");
    expect(linhas[0]).toContain("Cidade;UF");
    expect(linhas[1]).toContain("Casado(a)");
    expect(linhas[1]).toContain("17012-345");
    expect(linhas[1]).toContain("Bauru;SP");
    expect(linhas[2].startsWith("Beto;Transferido;Não membro")).toBe(true);
    // Todas as linhas com o mesmo número de colunas.
    expect(new Set(linhas.map((l) => l.split(";").length)).size).toBe(1);
  });
});

describe("aniversariantes", () => {
  it("ordena por dia e, no mesmo dia, por nome", () => {
    const r = ordenarAniversarios([
      aniversario({ nome: "Zeca", dia: 12 }),
      aniversario({ nome: "Bia", dia: 3 }),
      aniversario({ nome: "Ana", dia: 12 }),
    ]);
    expect(r.map((a) => a.nome)).toEqual(["Bia", "Ana", "Zeca"]);
  });

  it("próximos: resto do mês, depois o mês seguinte, com hoje e amanhã", () => {
    const r = proximosAniversarios(
      [
        aniversario({ nome: "Passou", dia: 2 }),
        aniversario({ nome: "Hoje", dia: 30 }),
        aniversario({ nome: "Amanha", dia: 31 }),
      ],
      [aniversario({ nome: "Novembro", dia: 4, data: "1990-11-04" })],
      "2026-10-30",
      5,
    );
    expect(r.map((a) => [a.nome, descreverQuando(a)])).toEqual([
      ["Hoje", "Hoje"],
      ["Amanha", "Amanhã"],
      ["Novembro", "04/11"],
    ]);
    // Dezembro emenda com janeiro do ano seguinte, e o limite corta.
    const virada = proximosAniversarios([], [aniversario({ dia: 3 }), aniversario({ dia: 9 })], "2026-12-31", 1);
    expect(virada.map((a) => a.quando)).toEqual(["2027-01-03"]);
  });

  it("descreve os anos completados no ano pedido", () => {
    expect(descreverAnos(aniversario(), 2026)).toBe("36 anos");
    expect(descreverAnos(aniversario({ tipo: "batismo", data: "2025-10-05" }), 2026)).toBe("1 ano de batismo");
    expect(descreverAnos(aniversario({ tipo: "casamento", data: "2016-10-05" }), 2026)).toBe("10 anos de casados");
    expect(descreverAnos(aniversario({ data: "2026-10-05" }), 2026)).toBeNull();
  });

  it("a mensagem usa a saudação da igreja e o primeiro nome", () => {
    expect(mensagemParabens(aniversario(), "Igreja X", "Graça e paz")).toBe(
      "Graça e paz, Ana! Feliz aniversário! A Igreja X deseja a você um novo ano cheio de bênçãos.",
    );
    expect(mensagemParabens(aniversario({ tipo: "casamento" }), "Igreja X")).toContain("aniversário de casamento");
    expect(mensagemParabens(aniversario({ tipo: "batismo" }), "Igreja X")).toContain("batismo");
  });
});
