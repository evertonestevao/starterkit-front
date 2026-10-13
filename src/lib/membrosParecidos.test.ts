import { describe, expect, it } from "vitest";
import { ordenarParecidos, palavrasDoNome, termosDaBusca } from "./membrosParecidos";

const c = (id: string, nome: string, whatsapp: string | null = null) => ({ id, nome, whatsapp });

const ROL = [
  c("1", "Douglas"), // cadastrado pela EBD só com o primeiro nome
  c("2", "Douglas Henrique Pacheco de Moraes"),
  c("3", "Maria da Silva", "14996556043"),
  c("4", "João Douglas Pereira"),
  c("5", "Silvana Souza"),
];

describe("membros parecidos", () => {
  it("palavras do nome: sem acento e sem as ligações", () => {
    expect(palavrasDoNome("José  da Sílva e Souza")).toEqual(["jose", "silva", "souza"]);
  });

  it("só busca com 3 letras do primeiro nome ou 8 dígitos de telefone", () => {
    expect(termosDaBusca("Do", "")).toEqual({ primeiroNome: null, fimDoTelefone: null });
    expect(termosDaBusca("Dou", "(14) 9965")).toEqual({ primeiroNome: "dou", fimDoTelefone: null });
    expect(termosDaBusca("", "(14) 99655-6043")).toEqual({ primeiroNome: null, fimDoTelefone: "96556043" });
  });

  it("'Douglas Silva' acha o 'Douglas' da EBD, e não todo mundo que é Silva", () => {
    const nomes = ordenarParecidos(ROL, { nome: "Douglas Silva", telefone: "" }).map((p) => p.candidato.nome);
    expect(nomes).toEqual(["Douglas", "Douglas Henrique Pacheco de Moraes", "João Douglas Pereira"]);
  });

  it("enquanto digita, vale o começo do primeiro nome", () => {
    const nomes = ordenarParecidos(ROL, { nome: "Dou", telefone: "" }).map((p) => p.candidato.nome);
    expect(nomes).toEqual(["Douglas", "Douglas Henrique Pacheco de Moraes", "João Douglas Pereira"]);
    expect(ordenarParecidos(ROL, { nome: "Do", telefone: "" })).toEqual([]);
  });

  it("mesmo telefone vem primeiro, mesmo com outro nome", () => {
    const r = ordenarParecidos(ROL, { nome: "Douglas Silva", telefone: "(14) 99655-6043" });
    expect(r[0]).toEqual({ candidato: ROL[2], mesmoTelefone: true });
    expect(r.slice(1).every((p) => !p.mesmoTelefone)).toBe(true);
  });

  it("mais palavras em comum sobem na lista; respeita o limite", () => {
    const nomes = ordenarParecidos(ROL, { nome: "Douglas Henrique", telefone: "" }).map((p) => p.candidato.nome);
    expect(nomes[0]).toBe("Douglas Henrique Pacheco de Moraes");
    expect(ordenarParecidos(ROL, { nome: "Douglas", telefone: "" }, 2)).toHaveLength(2);
  });
});
