import { describe, expect, it } from "vitest";
import type { ProximoAniversario } from "@/lib/rolMembros";
import type { Culto } from "@/types/acompanhamento";
import { montarParaHoje, quandoFoi, tarefaDaEbd, tarefasDosCultos } from "./paraHoje";

// 2026-10-14 é quarta-feira; 2026-10-11 foi domingo.
const HOJE = "2026-10-14";

const culto = (over: Partial<Culto>): Culto => ({
  id: "c1",
  churchId: "i1",
  nome: "Culto de Doutrina",
  tipo: "semanal",
  diaSemana: 3,
  data: null,
  hora: "19:30",
  registraChamada: true,
  removido: false,
  ...over,
});

describe("quandoFoi", () => {
  it("hoje, ontem ou o dia da semana com a data", () => {
    expect(quandoFoi(HOJE, HOJE)).toBe("hoje");
    expect(quandoFoi("2026-10-13", HOJE)).toBe("ontem");
    expect(quandoFoi("2026-10-11", HOJE)).toBe("domingo (11/10)");
  });
});

describe("chamadas de culto", () => {
  it("culto de hoje que já começou e está sem chamada: urgente", () => {
    const [t] = tarefasDosCultos([culto({})], [], HOJE, "20:00");
    expect(t).toMatchObject({
      titulo: "Chamada do culto de hoje: Culto de Doutrina (19h30)",
      href: "/dashboard/acompanhamento/chamada/c1?data=2026-10-14",
      urgente: true,
    });
  });

  it("culto de hoje que ainda vai começar: só lembrete (o da semana passada já saiu da janela)", () => {
    const r = tarefasDosCultos([culto({})], [], HOJE, "10:00");
    expect(r.map((t) => [t.titulo, Boolean(t.urgente)])).toEqual([["Hoje às 19h30: Culto de Doutrina", false]]);
  });

  it("chamada feita some da lista; culto sem chamada, removido ou fora da janela não aparece", () => {
    const domingo = culto({ id: "c2", nome: "Culto da Família", diaSemana: 0, hora: "18:00" });
    expect(
      tarefasDosCultos(
        [culto({}), domingo],
        [
          { cultoId: "c1", data: HOJE },
          { cultoId: "c2", data: "2026-10-11" },
        ],
        HOJE,
        "21:00",
      ),
    ).toEqual([]);
    expect(tarefasDosCultos([culto({ registraChamada: false }), culto({ removido: true })], [], HOJE, "21:00")).toEqual(
      [],
    );
    const especialAntigo = culto({ id: "c3", tipo: "especial", diaSemana: null, data: "2026-09-01" });
    expect(tarefasDosCultos([especialAntigo], [], HOJE, "21:00")).toEqual([]);
  });

  it("chamada esquecida de dias atrás, do mais recente para o mais antigo", () => {
    const domingo = culto({ id: "c2", nome: "Culto da Família", diaSemana: 0, hora: "18:00" });
    const sabado = culto({ id: "c4", nome: "Culto de Jovens", diaSemana: 6, hora: "19:00" });
    const r = tarefasDosCultos([domingo, sabado], [], HOJE, "08:00");
    expect(r.map((t) => t.titulo)).toEqual([
      "Chamada pendente: Culto da Família, domingo (11/10)",
      "Chamada pendente: Culto de Jovens, sábado (10/10)",
    ]);
  });
});

describe("EBD", () => {
  const classes = [
    { classeId: "a", classeNome: "Adultos", matriculados: 10, chamadaFeita: true },
    { classeId: "b", classeNome: "Jovens", matriculados: 8, chamadaFeita: false },
    { classeId: "c", classeNome: "Vazia", matriculados: 0, chamadaFeita: false },
  ];

  it("uma classe sem chamada: leva direto para a chamada dela", () => {
    expect(tarefaDaEbd("2026-10-11", "2026-10-12", classes)).toMatchObject({
      titulo: "Chamada da EBD de ontem: Jovens",
      href: "/dashboard/ebd/classes/b/chamada?data=2026-10-11",
      urgente: false,
    });
  });

  it("no domingo é urgente; várias classes vão para o resumo da EBD", () => {
    const todas = classes.map((c) => ({ ...c, chamadaFeita: false }));
    expect(tarefaDaEbd("2026-10-11", "2026-10-11", todas)).toMatchObject({
      titulo: "Chamada da EBD de hoje: 2 classes sem chamada",
      detalhe: "Adultos, Jovens",
      href: "/dashboard/ebd",
      urgente: true,
    });
  });

  it("passados 2 dias do domingo, ou sem pendência, não aparece", () => {
    expect(tarefaDaEbd("2026-10-11", "2026-10-14", classes)).toBeNull();
    expect(tarefaDaEbd("2026-10-11", "2026-10-11", [classes[0], classes[2]])).toBeNull();
  });
});

describe("montarParaHoje", () => {
  const aniversario = (over: Partial<ProximoAniversario>): ProximoAniversario => ({
    membroId: "m1",
    nome: "Maria Souza",
    whatsapp: "14996556043",
    tipo: "nascimento",
    data: "1980-10-14",
    dia: 14,
    conjugeNome: null,
    quando: "hoje",
    emDias: 0,
    ...over,
  });

  it("sem nada pendente, lista vazia", () => {
    expect(
      montarParaHoje({ hoje: HOJE, horaAgora: "10:00", emAlerta: 0, oracoesNovas: 0, visitasSemContato: 0 }),
    ).toEqual([]);
  });

  it("junta tudo e põe o urgente primeiro", () => {
    const r = montarParaHoje({
      hoje: HOJE,
      horaAgora: "20:00",
      emAlerta: 3,
      visitasSemContato: 1,
      oracoesNovas: 2,
      ebdEmAlerta: 1,
      cultos: { lista: [culto({})], feitas: [] },
      revistas: {
        trimestreId: "t1",
        trimestreNome: "4º trimestre",
        comecou: true,
        devendo: 2,
        aReceberCentavos: 3000,
        aEntregar: 1,
      },
      aniversarios: {
        itens: [aniversario({}), aniversario({ membroId: "m2", nome: "José", emDias: 3 })],
        igreja: "Igreja Teste",
        saudacao: "Paz do Senhor",
      },
      eventos: [{ id: "e1", titulo: "Congresso", inicio: "", inscritos: 1, diaInicio: HOJE }],
    });
    expect(r.map((t) => t.titulo)).toEqual([
      "Chamada do culto de hoje: Culto de Doutrina (19h30)",
      "3 pessoas com faltas seguidas nos cultos",
      "1 aluno da EBD com faltas seguidas",
      "1 pedido de visita sem contato",
      "2 pedidos de oração novos",
      "Revistas da EBD · 4º trimestre",
      "Hoje é aniversário de Maria Souza",
      "Hoje: Congresso",
    ]);
    expect(r.find((t) => t.icone === "revista")?.detalhe).toMatch(
      /2 pedidos com pagamento pendente \(R\$\s?30,00\) · 1 pedido a entregar/,
    );
    const parabens = r.find((t) => t.icone === "aniversario");
    expect(parabens?.externo).toBe(true);
    expect(parabens?.href).toMatch(/^https:\/\/wa\.me\/5514996556043\?text=/);
  });

  it("revista: antes do trimestre começar, 'a entregar' não é pendência", () => {
    const r = montarParaHoje({
      hoje: HOJE,
      horaAgora: "10:00",
      revistas: {
        trimestreId: "t",
        trimestreNome: "1º tri",
        comecou: false,
        devendo: 0,
        aReceberCentavos: 0,
        aEntregar: 9,
      },
    });
    expect(r).toEqual([]);
  });

  it("aniversariante sem WhatsApp leva ao cadastro", () => {
    const [t] = montarParaHoje({
      hoje: HOJE,
      horaAgora: "10:00",
      aniversarios: { itens: [aniversario({ whatsapp: null, tipo: "casamento" })], igreja: "X", saudacao: "" },
    });
    expect(t).toMatchObject({
      titulo: "Hoje é aniversário de casamento de Maria Souza",
      href: "/dashboard/membros/m1",
      acao: "Ver cadastro",
    });
  });
});
