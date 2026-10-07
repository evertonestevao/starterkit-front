import { describe, expect, it } from "vitest";
import {
  diasEntre,
  menusComBloqueio,
  montarAviso,
  montarBloqueio,
  pendenciaPrincipal,
  type MensalidadePendente,
} from "./mensalidadeAviso";

const pendencia = (over: Partial<MensalidadePendente> = {}): MensalidadePendente => ({
  churchId: "c1",
  churchName: "Igreja Betel",
  motivo: "fatura_vencida",
  desde: "2026-10-10",
  toleranciaAte: "2026-10-24",
  ...over,
});

describe("diasEntre", () => {
  it("conta dias corridos, atravessando o mês", () => {
    expect(diasEntre("2026-10-10", "2026-10-24")).toBe(14);
    expect(diasEntre("2026-10-30", "2026-11-02")).toBe(3);
    expect(diasEntre("2026-10-08", "2026-10-01")).toBe(-7);
  });
});

describe("montarAviso", () => {
  it("dentro da tolerância é um lembrete, com a data-limite e o que vem depois", () => {
    const a = montarAviso(pendencia(), "2026-10-11");
    expect(a?.texto).toContain("venceu em 10/10/2026");
    expect(a?.texto).toContain("Você tem até 24/10/2026 para regularizar");
    expect(a?.texto).toContain("até lá nada muda no uso do sistema");
    expect(a?.texto).toContain("o acesso ao painel fica suspenso até o pagamento ser confirmado");
    expect(a?.acao).toBe("Ver a mensalidade");
  });

  it("no penúltimo e no último dia, fala em amanhã e hoje", () => {
    expect(montarAviso(pendencia(), "2026-10-23")?.texto).toContain("Você tem até amanhã");
    expect(montarAviso(pendencia(), "2026-10-24")?.texto).toContain("Hoje é o último dia");
  });

  it("passada a tolerância não há mais aviso: quem fala é a suspensão", () => {
    expect(montarAviso(pendencia(), "2026-10-25")).toBeNull();
  });

  it("lembra que quem já pagou pode desconsiderar", () => {
    expect(montarAviso(pendencia(), "2026-10-11")?.texto).toContain("pode desconsiderar");
  });

  it("quem nunca cadastrou o pagamento é convidado a cadastrar", () => {
    const sem = montarAviso(pendencia({ motivo: "sem_cadastro" }), "2026-10-11");
    expect(sem?.texto).toContain("ainda não tem uma forma de pagamento cadastrada");
    expect(sem?.acao).toBe("Cadastrar o pagamento");
    const meio = montarAviso(pendencia({ motivo: "cadastro_incompleto" }), "2026-10-11");
    expect(meio?.texto).toContain("iniciado, mas não concluído");
  });

  it("com mais de uma igreja na conta, diz de qual é", () => {
    expect(montarAviso(pendencia(), "2026-10-11")?.texto).toContain("A mensalidade da igreja");
    expect(montarAviso(pendencia(), "2026-10-11", true)?.texto).toContain("A mensalidade de Igreja Betel");
  });
});

describe("montarBloqueio", () => {
  it("para quem administra: o que aconteceu, que nada foi apagado e como reativar", () => {
    const b = montarBloqueio(pendencia(), true);
    expect(b.texto).toContain("venceu em 10/10/2026");
    expect(b.texto).toContain("o prazo para regularizar terminou em 24/10/2026");
    expect(b.texto).toContain("Nada foi apagado");
    expect(b.texto).toContain("volta ao normal");
    expect(b.acao).toBe("Pagar e reativar");
    expect(montarBloqueio(pendencia({ motivo: "sem_cadastro" }), true).acao).toBe("Cadastrar o pagamento e reativar");
  });

  it("para os demais: sem motivo nem botão, só a quem procurar", () => {
    const b = montarBloqueio(pendencia(), false);
    expect(b.acao).toBeNull();
    expect(b.texto).toContain("procure o Responsável");
    expect(b.texto).toContain("Nada foi apagado");
    expect(b.texto.toLowerCase()).not.toMatch(/mensalidade|pagamento|fatura|venc/);
  });

  it("sem o detalhe da pendência, a mensagem fica genérica mas ainda leva à mensalidade", () => {
    const b = montarBloqueio(null, true);
    expect(b.texto).toContain("Nada foi apagado");
    expect(b.acao).toBe("Ver a mensalidade");
  });

  it("é educada: não fala em inadimplência nem em cancelamento", () => {
    for (const b of [
      montarBloqueio(pendencia(), true),
      montarBloqueio(pendencia(), false),
      montarBloqueio(null, true),
    ]) {
      expect(b.texto.toLowerCase()).not.toMatch(/inadimpl|cancel|bloque|calote|dívida/);
    }
  });
});

describe("pendenciaPrincipal", () => {
  it("escolhe a de prazo mais apertado; sem pendência, nada", () => {
    const lista = [
      pendencia({ churchId: "a", toleranciaAte: "2026-10-12" }),
      pendencia({ churchId: "b", toleranciaAte: "2026-10-05" }),
    ];
    expect(pendenciaPrincipal(lista)?.churchId).toBe("b");
    expect(pendenciaPrincipal([])).toBeNull();
  });
});

describe("menusComBloqueio", () => {
  it("igreja suspensa: sobra só a mensalidade, e só para quem já a via", () => {
    expect(menusComBloqueio(["dashboard", "members", "mensalidade", "settings"], true)).toEqual(["mensalidade"]);
    expect(menusComBloqueio(["dashboard", "ebd"], true)).toEqual([]);
  });

  it("igreja em dia: os menus não mudam", () => {
    const menus = ["dashboard", "members", "mensalidade"];
    expect(menusComBloqueio(menus, false)).toEqual(menus);
  });
});
