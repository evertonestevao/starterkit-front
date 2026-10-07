import { describe, expect, it } from "vitest";
import {
  buscarUnidades,
  domingoDaSemana,
  menusComRede,
  percentual,
  porUrgencia,
  recorte,
  saudeDaUnidade,
  serieMensal,
  serieSemanal,
  totaisDaRede,
  type MesDaRede,
  type SemanaDaRede,
  type UnidadeDaRede,
} from "./painelRede";

const HOJE = "2026-10-07"; // quarta-feira

const unidade = (over: Partial<UnidadeDaRede> = {}): UnidadeDaRede => ({
  churchId: "u1",
  churchName: "Congregação Betânia",
  tipo: "congregacao",
  parentId: "sede",
  nivel: 1,
  paginaAtiva: true,
  membrosAtivos: 40,
  membrosAfastados: 2,
  membrosNovos90d: 3,
  cultoUltimaChamada: "2026-10-04",
  cultoPresenca8s: 78,
  cultoEmAlerta: 2,
  cultoVisitantes30d: 5,
  ebdClasses: 3,
  ebdMatriculados: 25,
  ebdUltimaAula: "2026-10-04",
  ebdPresenca8s: 70,
  visitasSemContato: 0,
  visitasFeitas90d: 4,
  eventosProximos: 1,
  dizimosMesCents: 150_000,
  ofertasMesCents: 50_000,
  mensalidade: null,
  ...over,
});

const semana = (over: Partial<SemanaDaRede> = {}): SemanaDaRede => ({
  churchId: "u1",
  semana: "2026-10-04",
  cultoPresentes: 30,
  cultoAusentes: 10,
  cultoVisitantes: 2,
  ebdPresentes: 14,
  ebdAusentes: 6,
  ...over,
});

describe("saudeDaUnidade", () => {
  it("unidade em dia com tudo: boa, sem motivos", () => {
    expect(saudeDaUnidade(unidade(), HOJE)).toEqual({ nivel: "boa", motivos: [] });
  });

  it("sem culto nem EBD há muito tempo: parada", () => {
    const s = saudeDaUnidade(unidade({ cultoUltimaChamada: "2026-07-01", ebdUltimaAula: "2026-06-01" }), HOJE);
    expect(s.nivel).toBe("parada");
    expect(s.motivos[0]).toContain("há mais de 45 dias");
  });

  it("nunca registrou nada: parada, com outra frase", () => {
    const s = saudeDaUnidade(unidade({ cultoUltimaChamada: null, ebdUltimaAula: null }), HOJE);
    expect(s).toEqual({ nivel: "parada", motivos: ["Ainda não registrou culto nem EBD"] });
  });

  it("só o culto parou, a EBD segue: atenção, não parada", () => {
    const s = saudeDaUnidade(unidade({ cultoUltimaChamada: "2026-07-01" }), HOJE);
    expect(s.nivel).toBe("atencao");
    expect(s.motivos).toContain("Sem chamada de culto há 98 dias");
  });

  it("presença baixa, muitos em alerta e visita sem contato pedem atenção", () => {
    const s = saudeDaUnidade(unidade({ cultoPresenca8s: 41.5, cultoEmAlerta: 8, visitasSemContato: 1 }), HOJE);
    expect(s.nivel).toBe("atencao");
    expect(s.motivos).toEqual([
      "Presença nos cultos em 41,5%",
      "8 membros em alerta de faltas",
      "1 pedido de visita sem contato",
    ]);
  });

  it("poucos em alerta em relação ao tamanho da igreja não acusam", () => {
    expect(saudeDaUnidade(unidade({ membrosAtivos: 100, cultoEmAlerta: 19 }), HOJE).nivel).toBe("boa");
    expect(saudeDaUnidade(unidade({ membrosAtivos: 100, cultoEmAlerta: 20 }), HOJE).nivel).toBe("atencao");
  });

  it("igreja sem classes de EBD não é cobrada por não dar aula", () => {
    const s = saudeDaUnidade(unidade({ ebdClasses: 0, ebdUltimaAula: null, ebdPresenca8s: null }), HOJE);
    expect(s.nivel).toBe("boa");
  });

  it("EBD com classes e sem aula recente pede atenção", () => {
    const s = saudeDaUnidade(unidade({ ebdUltimaAula: "2026-09-06" }), HOJE);
    expect(s.motivos).toEqual(["EBD sem aula há 31 dias"]);
  });

  it("a mensalidade entra nos motivos só quando vem do banco", () => {
    expect(saudeDaUnidade(unidade({ mensalidade: "em_dia" }), HOJE).nivel).toBe("boa");
    expect(saudeDaUnidade(unidade({ mensalidade: "pendente" }), HOJE).motivos).toEqual(["Mensalidade pendente"]);
    const suspensa = saudeDaUnidade(
      unidade({ mensalidade: "suspensa", cultoUltimaChamada: null, ebdUltimaAula: null }),
      HOJE,
    );
    expect(suspensa.nivel).toBe("parada");
    expect(suspensa.motivos).toEqual(["Ainda não registrou culto nem EBD", "Painel suspenso por mensalidade pendente"]);
  });
});

describe("percentual", () => {
  it("presentes sobre presentes + ausentes, com uma casa", () => {
    expect(percentual(30, 10)).toBe(75);
    expect(percentual(2, 1)).toBe(66.7);
    expect(percentual(0, 0)).toBeNull();
  });
});

describe("buscarUnidades e recorte", () => {
  const lista = [
    unidade({ churchId: "a", churchName: "Congregação Betânia" }),
    unidade({ churchId: "b", churchName: "Subsede São José" }),
  ];

  it("busca sem ligar para acento nem maiúscula", () => {
    expect(buscarUnidades(lista, "betania").map((u) => u.churchId)).toEqual(["a"]);
    expect(buscarUnidades(lista, "  SAO jose ").map((u) => u.churchId)).toEqual(["b"]);
    expect(buscarUnidades(lista, "")).toHaveLength(2);
    expect(buscarUnidades(lista, "nada")).toEqual([]);
  });

  it("recorte: todas, ou só a escolhida", () => {
    expect(recorte(lista, null)).toHaveLength(2);
    expect(recorte(lista, "b").map((u) => u.churchId)).toEqual(["b"]);
  });
});

describe("totaisDaRede", () => {
  const unidades = [
    unidade({ churchId: "a" }),
    unidade({ churchId: "b", membrosAtivos: 300, dizimosMesCents: 1_000_000, visitasSemContato: 2 }),
  ];
  const semanas = [
    semana({ churchId: "a", cultoPresentes: 5, cultoAusentes: 5 }), // 50%
    semana({ churchId: "b", cultoPresentes: 270, cultoAusentes: 30 }), // 90%
    semana({ churchId: "b", semana: "2026-07-05", cultoPresentes: 0, cultoAusentes: 300 }), // fora das 8 semanas
    semana({ churchId: "outra", cultoPresentes: 0, cultoAusentes: 999 }), // fora do recorte
  ];

  it("soma as unidades e conta a saúde de cada uma", () => {
    const t = totaisDaRede(unidades, semanas, HOJE);
    expect(t.unidades).toBe(2);
    expect(t.membrosAtivos).toBe(340);
    expect(t.dizimosMesCents).toBe(1_150_000);
    expect(t.saude).toEqual({ boa: 1, atencao: 1, parada: 0 });
  });

  it("a presença é sobre as pessoas, não a média dos percentuais das unidades", () => {
    // (5 + 270) / (10 + 300) = 88,7% — a média simples de 50% e 90% daria 70%.
    expect(totaisDaRede(unidades, semanas, HOJE).presencaCultos).toBe(88.7);
  });

  it("sem a mensalidade vinda do banco, não inventa a contagem", () => {
    expect(totaisDaRede(unidades, semanas, HOJE).mensalidadesPendentes).toBeNull();
    const comMensalidade = [unidade({ mensalidade: "em_dia" }), unidade({ churchId: "b", mensalidade: "suspensa" })];
    expect(totaisDaRede(comMensalidade, semanas, HOJE).mensalidadesPendentes).toBe(1);
  });
});

describe("séries dos gráficos", () => {
  it("domingoDaSemana: a semana vai de segunda a domingo", () => {
    expect(domingoDaSemana("2026-10-07")).toBe("2026-10-11"); // quarta
    expect(domingoDaSemana("2026-10-05")).toBe("2026-10-11"); // segunda
    expect(domingoDaSemana("2026-10-04")).toBe("2026-10-04"); // domingo
  });

  it("serieSemanal: 12 semanas até a de hoje, com buraco onde não houve registro", () => {
    const serie = serieSemanal([semana(), semana({ churchId: "b", cultoPresentes: 10, cultoAusentes: 0 })], null, HOJE);
    expect(serie).toHaveLength(12);
    expect(serie.at(-1)?.semana).toBe("11/10");
    const dia4 = serie.at(-2);
    expect(dia4).toMatchObject({ semana: "04/10", cultoPresentes: 40, cultoPresenca: 80, ebdPresenca: 70 });
    expect(serie[0]).toMatchObject({ semana: "26/07", cultoPresentes: 0, cultoPresenca: null });
  });

  it("serieSemanal: filtrada por unidade, só os números dela", () => {
    const serie = serieSemanal([semana(), semana({ churchId: "b", cultoPresentes: 10, cultoAusentes: 0 })], "b", HOJE);
    expect(serie.at(-2)).toMatchObject({ cultoPresentes: 10, cultoPresenca: 100 });
  });

  it("serieMensal: 6 meses até o de hoje, em reais, atravessando o ano", () => {
    const meses: MesDaRede[] = [
      { churchId: "a", mes: "2026-10-01", dizimosCents: 123_450, ofertasCents: 5_000, membrosNovos: 2 },
      { churchId: "b", mes: "2026-10-01", dizimosCents: 100_000, ofertasCents: 0, membrosNovos: 1 },
    ];
    const serie = serieMensal(meses, null, HOJE);
    expect(serie.map((p) => p.mes)).toEqual(["mai/26", "jun/26", "jul/26", "ago/26", "set/26", "out/26"]);
    expect(serie.at(-1)).toEqual({ mes: "out/26", dizimos: 2234.5, ofertas: 50, membrosNovos: 3 });
    expect(serieMensal(meses, "b", HOJE).at(-1)?.dizimos).toBe(1000);
    expect(serieMensal([], null, "2026-02-10").map((p) => p.mes)[0]).toBe("set/25");
  });
});

describe("porUrgencia", () => {
  it("paradas primeiro, depois as que pedem atenção, e as boas no fim", () => {
    const lista = [
      unidade({ churchId: "boa" }),
      unidade({ churchId: "atencao", visitasSemContato: 3 }),
      unidade({ churchId: "parada", cultoUltimaChamada: null, ebdUltimaAula: null }),
      unidade({ churchId: "boa2" }),
    ];
    expect(porUrgencia(lista, HOJE).map((u) => u.churchId)).toEqual(["parada", "atencao", "boa", "boa2"]);
  });
});

describe("menusComRede", () => {
  it("o item Rede some para a igreja sem unidades abaixo, e só ele", () => {
    expect(menusComRede(["dashboard", "rede", "membros"], false)).toEqual(["dashboard", "membros"]);
    expect(menusComRede(["dashboard", "rede", "membros"], true)).toEqual(["dashboard", "rede", "membros"]);
  });
});
