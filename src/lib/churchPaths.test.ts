import { describe, expect, it } from "vitest";
import {
  caminhoDaIgreja,
  enderecoPublicoDaRotaInterna,
  partesDaChave,
  resolverNoDominioDaRede,
  rotaInternaDaIgreja,
} from "./churchPaths";

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
    expect(rotaInternaDaIgreja("/igreja/adipiranga/igrejas")).toBeNull();
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

describe("resolverNoDominioDaRede", () => {
  const r = (caminho: string) => resolverNoDominioDaRede("adipiranga", caminho);

  it("a raiz e as subpáginas são da sede", () => {
    expect(r("/")).toEqual({ acao: "reescrever", caminho: "/igreja/adipiranga" });
    expect(r("/eventos")).toEqual({ acao: "reescrever", caminho: "/igreja/adipiranga/eventos" });
    expect(r("/campanhas/123")).toEqual({ acao: "reescrever", caminho: "/igreja/adipiranga/campanhas/123" });
    expect(r("/igrejas")).toEqual({ acao: "reescrever", caminho: "/igreja/adipiranga/igrejas" });
  });

  it("/igreja/{codigo} é uma igreja DESTA rede, com as subpáginas dela", () => {
    expect(r("/igreja/lins")).toEqual({ acao: "reescrever", caminho: "/igreja/adipiranga~lins" });
    expect(r("/igreja/lins/eventos/abc")).toEqual({ acao: "reescrever", caminho: "/igreja/adipiranga~lins/eventos/abc" });
  });

  it("endereço no formato da plataforma, para esta rede, encurta", () => {
    expect(r("/igreja/adipiranga")).toEqual({ acao: "redirecionar", caminho: "/" });
    expect(r("/igreja/adipiranga/eventos")).toEqual({ acao: "redirecionar", caminho: "/eventos" });
    expect(r("/igreja/adipiranga/lins")).toEqual({ acao: "redirecionar", caminho: "/igreja/lins" });
    expect(r("/igreja/adipiranga/lins/campanhas/9")).toEqual({ acao: "redirecionar", caminho: "/igreja/lins/campanhas/9" });
    expect(r("/igreja/adipiranga~lins")).toEqual({ acao: "redirecionar", caminho: "/igreja/lins" });
  });

  it("igreja de outra rede não aparece neste domínio", () => {
    // O código da outra sede é procurado como filial desta rede: não existe.
    expect(r("/igreja/admadureira")).toEqual({ acao: "reescrever", caminho: "/igreja/adipiranga~admadureira" });
    // E a filial da outra cai numa rota que não existe (o "lins" vira subcaminho).
    expect(r("/igreja/admadureira/lins")).toEqual({ acao: "reescrever", caminho: "/igreja/adipiranga~admadureira/lins" });
    expect(r("/igreja/admadureira~lins")?.caminho).not.toContain("admadureira");
  });

  it("o resto segue o fluxo normal", () => {
    expect(r("/terms/igreja")).toBeNull();
    expect(r("/igreja")).toBeNull();
    expect(r("/igreja/Coisa Estranha")).toBeNull();
  });
});
