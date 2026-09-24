import { describe, expect, it } from "vitest";
import type { ChurchLinkNode } from "@/types/churchLinks";
import {
  buildNetwork,
  describeCongregations,
  filterNetwork,
  sortNetwork,
  summarizeNetwork,
} from "./churchNetwork";

function igreja(id: string, name: string, tipo: ChurchLinkNode["tipo"], sobrenome: string | null = null): ChurchLinkNode {
  return { id, name, sobrenome, tipo, publicCode: id };
}

const norte = igreja("norte", "Graça Zona Norte", "subsede");
const sul = igreja("sul", "Graça Zona Sul", "subsede");
const litoral = igreja("litoral", "Graça Litoral", "subsede");
const avulsa = igreja("avulsa", "Congregação Avulsa", "congregacao");

const rede = buildNetwork([litoral, norte, sul, avulsa], {
  norte: [igreja("vila", "Vila Nova", "congregacao"), igreja("jardim", "Jardim das Flores", "congregacao")],
  sul: [igreja("ponte", "Ponte Alta", "congregacao")],
});

describe("describeCongregations", () => {
  it("singular, plural e nenhuma", () => {
    expect(describeCongregations(0)).toBe("Sem congregações");
    expect(describeCongregations(1)).toBe("1 congregação");
    expect(describeCongregations(3)).toBe("3 congregações");
  });
});

describe("buildNetwork e summarizeNetwork", () => {
  it("cada igreja leva as congregações dela; quem não tem fica com lista vazia", () => {
    expect(rede.find((e) => e.church.id === "litoral")?.congregacoes).toEqual([]);
    expect(rede.find((e) => e.church.id === "norte")?.congregacoes).toHaveLength(2);
  });

  it("conta subsedes e todas as congregações, as ligadas direto e as de cada subsede", () => {
    expect(summarizeNetwork(rede)).toEqual({ subsedes: 3, congregacoes: 4, text: "3 subsedes · 4 congregações" });
    expect(summarizeNetwork(buildNetwork([norte], {})).text).toBe("1 subsede");
    expect(summarizeNetwork([]).text).toBe("");
  });
});

describe("filterNetwork", () => {
  it("busca vazia devolve todas", () => {
    expect(filterNetwork(rede, "  ")).toHaveLength(4);
  });

  it("ignora acento e caixa", () => {
    expect(filterNetwork(rede, "graca").map((m) => m.entry.church.id)).toEqual(["litoral", "norte", "sul"]);
    expect(filterNetwork(rede, "ZONA NORTE").map((m) => m.entry.church.id)).toEqual(["norte"]);
  });

  it("acha a subsede pelo nome de uma congregação dela e diz qual bateu", () => {
    const [achada, ...resto] = filterNetwork(rede, "ponte");
    expect(resto).toEqual([]);
    expect(achada.entry.church.id).toBe("sul");
    expect(achada.nested.map((c) => c.name)).toEqual(["Ponte Alta"]);
  });

  it("quando o nome da própria igreja bate, não repete as congregações como achadas", () => {
    const [achada] = filterNetwork(rede, "zona norte");
    expect(achada.nested).toEqual([]);
  });

  it("acha pelo sobrenome", () => {
    const comSobrenome = buildNetwork([igreja("x", "Igreja X", "subsede", "Prainha")], {});
    expect(filterNetwork(comSobrenome, "prainha")).toHaveLength(1);
  });
});

describe("sortNetwork", () => {
  it("por nome, em ordem alfabética do português", () => {
    const ordenadas = sortNetwork(filterNetwork(rede, ""), "nome").map((m) => m.entry.church.id);
    expect(ordenadas).toEqual(["avulsa", "litoral", "norte", "sul"]);
  });

  it("pelas que têm mais congregações primeiro, desempatando por nome", () => {
    const ordenadas = sortNetwork(filterNetwork(rede, ""), "congregacoes").map((m) => m.entry.church.id);
    expect(ordenadas).toEqual(["norte", "sul", "avulsa", "litoral"]);
  });

  it("não altera a lista original", () => {
    const original = filterNetwork(rede, "");
    const copia = [...original];
    sortNetwork(original, "congregacoes");
    expect(original).toEqual(copia);
  });
});
