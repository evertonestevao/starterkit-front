import { describe, expect, it } from "vitest";
import { caminhoDaIgreja, enderecoPublicoDaRotaInterna, partesDaChave, rotaInternaDaIgreja } from "./churchPaths";

describe("partesDaChave / caminhoDaIgreja", () => {
  it("igreja do topo: só o código", () => {
    expect(partesDaChave("adipiranga")).toEqual({ rede: null, codigo: "adipiranga" });
    expect(caminhoDaIgreja("adipiranga")).toBe("/igreja/adipiranga");
  });

  it("igreja abaixo de outra: rede e código em pedaços separados", () => {
    expect(partesDaChave("adipiranga~lins")).toEqual({ rede: "adipiranga", codigo: "lins" });
    expect(caminhoDaIgreja("adipiranga~betel-lins")).toBe("/igreja/adipiranga/betel-lins");
  });
});

describe("rotaInternaDaIgreja", () => {
  it("traduz rede/código, mantendo o resto do caminho", () => {
    expect(rotaInternaDaIgreja("/igreja/adipiranga/lins")).toBe("/igreja/adipiranga~lins");
    expect(rotaInternaDaIgreja("/igreja/adipiranga/lins/eventos/abc")).toBe("/igreja/adipiranga~lins/eventos/abc");
  });

  it("não mexe na igreja do topo nem nas subpáginas dela", () => {
    expect(rotaInternaDaIgreja("/igreja/adipiranga")).toBeNull();
    expect(rotaInternaDaIgreja("/igreja/adipiranga/eventos")).toBeNull();
    expect(rotaInternaDaIgreja("/igreja/adipiranga/campanhas/123")).toBeNull();
  });

  it("ignora outras rotas e pedaços que não são código", () => {
    expect(rotaInternaDaIgreja("/dashboard/membros/123")).toBeNull();
    expect(rotaInternaDaIgreja("/igreja/Adi Piranga/lins")).toBeNull();
    expect(rotaInternaDaIgreja("/igreja/adipiranga/..")).toBeNull();
    expect(rotaInternaDaIgreja("/igreja/a~b/lins")).toBeNull();
  });
});

describe("enderecoPublicoDaRotaInterna", () => {
  it("rota interna aberta direto volta para o endereço público", () => {
    expect(enderecoPublicoDaRotaInterna("/igreja/adipiranga~lins")).toBe("/igreja/adipiranga/lins");
    expect(enderecoPublicoDaRotaInterna("/igreja/adipiranga%7Elins/eventos")).toBe("/igreja/adipiranga/lins/eventos");
  });

  it("endereço já público (ou de outra rota) não redireciona", () => {
    expect(enderecoPublicoDaRotaInterna("/igreja/adipiranga")).toBeNull();
    expect(enderecoPublicoDaRotaInterna("/igreja/adipiranga/lins")).toBeNull();
    expect(enderecoPublicoDaRotaInterna("/patrocinador/patrocinar/adipiranga~lins")).toBeNull();
    expect(enderecoPublicoDaRotaInterna("/igreja/~lins")).toBeNull();
  });
});
