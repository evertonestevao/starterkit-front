import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import {
  cartaoAtivo,
  createChurchReceivingService,
  createDonationWebhookService,
  documentoValido,
  type ChurchReceivingAccount,
  type ChurchReceivingRepository,
  type DonationStore,
  type ReceivingActor,
  type ReceivingProviderPort,
} from "./churchReceivingService";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const IGREJA = "33333333-3333-4333-8333-333333333333";
const OUTRA = "44444444-4444-4444-8444-444444444444";

const ADMIN: ReceivingActor = {
  companyId: EMPRESA,
  role: "admin",
  userId: "55555555-5555-4555-8555-555555555555",
};

const CADASTRO = {
  churchId: IGREJA,
  razaoSocial: "Associação Igreja Betel",
  documento: "11.222.333/0001-81",
  email: "tesouraria@betel.org.br",
  telefone: "14999998888",
  cep: "16400-000",
  endereco: "Rua das Flores",
  enderecoNumero: "540",
  bairro: "Centro",
  cidade: "Lins",
  uf: "sp",
  nascimento: "",
  rendaMensal: "R$ 5.000,00",
};

function conta(over: Partial<ChurchReceivingAccount> = {}): ChurchReceivingAccount {
  return {
    id: "conta-1",
    churchId: IGREJA,
    churchName: "Igreja Betel",
    churchPublicCode: "betel",
    razaoSocial: "Associação Igreja Betel",
    documento: "11222333000181",
    email: "tesouraria@betel.org.br",
    telefone: "14999998888",
    cep: "16400000",
    endereco: "Rua das Flores",
    enderecoNumero: "540",
    bairro: "Centro",
    cidade: "Lins",
    uf: "SP",
    nascimento: null,
    rendaMensalCents: 500000,
    provider: "fake",
    status: "em_analise",
    externalAccountId: "acc_1",
    linkDoacaoCartao: null,
    linkDoacaoPix: null,
    motivoRecusa: null,
    aceitaCartao: false,
    pixFonte: "propria",
    ...over,
  };
}

/**
 * Dublê da cifra. Precisa ESCONDER o texto original: com um "selado:<valor>"
 * qualquer, o teste de que a chave não vaza passaria sem provar nada.
 */
function selar(valor: string): string {
  return `cifrado(${Buffer.from(valor, "utf8").toString("base64")})`;
}

function abrir(selado: string): string {
  return Buffer.from(selado.slice("cifrado(".length, -1), "base64").toString("utf8");
}

function build({
  atual = null as ChurchReceivingAccount | null,
  statusCriacao = "em_analise" as "em_analise" | "aprovada",
  apiKey = "chave-da-subconta" as string | null,
} = {}) {
  let armazenada = atual;
  const repo: ChurchReceivingRepository = {
    listCompanyChurches: vi.fn(async () => [{ id: IGREJA, name: "Igreja Betel", publicCode: "betel" }]),
    findByChurch: vi.fn(async () => armazenada),
    listByCompany: vi.fn(async () => (armazenada ? [armazenada] : [])),
    saveRegistration: vi.fn(async (input) => {
      armazenada = conta({ status: "pendente_envio", externalAccountId: null, ...input });
      return armazenada;
    }),
    setAceitaCartao: vi.fn(async (_c, _i, aceita) => {
      if (armazenada) armazenada = { ...armazenada, aceitaCartao: aceita };
      return true;
    }),
    saveProviderResult: vi.fn(async (input) => {
      if (armazenada) {
        armazenada = {
          ...armazenada,
          provider: input.provider,
          status: input.status,
          externalAccountId: input.externalAccountId,
        };
      }
    }),
    updateStatus: vi.fn(async (_id, status) => {
      if (armazenada) armazenada = { ...armazenada, status };
    }),
    setCardDonationLink: vi.fn(async (_id, url) => {
      if (armazenada) armazenada = { ...armazenada, linkDoacaoCartao: url };
    }),
    setPixDonationLink: vi.fn(async (_id, url) => {
      if (armazenada) armazenada = { ...armazenada, linkDoacaoPix: url };
    }),
    setPixFonte: vi.fn(async (_c, _i, fonte) => {
      if (armazenada) armazenada = { ...armazenada, pixFonte: fonte };
      return true;
    }),
    getSealedApiKey: vi.fn(async () => (apiKey ? selar(apiKey) : null)),
  };

  const provider: ReceivingProviderPort = {
    name: "fake",
    createAccount: vi.fn(async () => ({
      accountId: "acc_1",
      walletId: "wallet_1",
      apiKey,
      status: statusCriacao,
    })),
    getAccountStatus: vi.fn(async () => "aprovada" as const),
    ensureDonationLink: vi.fn(async () => ({ url: "https://pagamento.exemplo/doar/betel" })),
  };

  const secrets = {
    seal: vi.fn(selar),
    open: vi.fn(abrir),
    newWebhookToken: vi.fn(() => ({ token: "tok", hash: "hash-do-tok" })),
  };
  const audit = { record: vi.fn(async () => undefined) };

  return {
    repo,
    provider,
    secrets,
    audit,
    service: createChurchReceivingService({
      repo,
      provider,
      secrets,
      appUrl: "https://app.exemplo/",
      audit,
      log: { error: vi.fn() },
    }),
  };
}

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("documentoValido", () => {
  it("aceita CPF e CNPJ de verdade, recusa o resto", () => {
    expect(documentoValido("529.982.247-25")).toBe(true);
    expect(documentoValido("11.222.333/0001-81")).toBe(true);
    expect(documentoValido("111.111.111-11")).toBe(false);
    expect(documentoValido("123")).toBe(false);
  });
});

describe("cartaoAtivo", () => {
  it("exige conta aprovada, escolha da igreja E link pronto", () => {
    expect(cartaoAtivo({ status: "aprovada", aceitaCartao: true, linkDoacaoCartao: "x" })).toBe(true);
    expect(cartaoAtivo({ status: "em_analise", aceitaCartao: true, linkDoacaoCartao: "x" })).toBe(false);
    expect(cartaoAtivo({ status: "aprovada", aceitaCartao: false, linkDoacaoCartao: "x" })).toBe(false);
    expect(cartaoAtivo({ status: "aprovada", aceitaCartao: true, linkDoacaoCartao: null })).toBe(false);
  });
});

describe("submitRegistration", () => {
  it("guarda o cadastro antes de falar com o provedor e manda o webhook da igreja", async () => {
    const { repo, provider, service } = build();

    await service.submitRegistration(ADMIN, CADASTRO);

    // Os dados entram no banco primeiro: recusa do provedor não apaga o que
    // a igreja digitou.
    const ordemCadastro = (repo.saveRegistration as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const ordemProvedor = (provider.createAccount as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(ordemCadastro).toBeLessThan(ordemProvedor);

    expect(provider.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        documento: "11222333000181",
        cep: "16400000",
        uf: "SP",
        webhookUrl: "https://app.exemplo/api/webhooks/donations/fake",
        webhookToken: "tok",
      }),
    );
  });

  it("guarda a chave da subconta CIFRADA, nunca em claro", async () => {
    const { repo, secrets, service } = build();

    await service.submitRegistration(ADMIN, CADASTRO);

    expect(secrets.seal).toHaveBeenCalledWith("chave-da-subconta");
    expect(repo.saveProviderResult).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyCifrada: selar("chave-da-subconta"),
        webhookTokenHash: "hash-do-tok",
      }),
    );
    // O token do webhook vai para o provedor, e só o hash fica guardado.
    const gravado = (repo.saveProviderResult as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(JSON.stringify(gravado)).not.toContain("chave-da-subconta");
    expect(JSON.stringify(gravado)).not.toContain('"tok"');
  });

  it("não manda o documento para a trilha de auditoria", async () => {
    const { audit, service } = build();

    await service.submitRegistration(ADMIN, CADASTRO);

    const registro = (audit.record as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(JSON.stringify(registro)).not.toContain("11222333000181");
  });

  it("provedor que já aprova na hora ganha o link de doação", async () => {
    const { repo, provider, service } = build({ statusCriacao: "aprovada" });

    await service.submitRegistration(ADMIN, CADASTRO);

    expect(provider.ensureDonationLink).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "chave-da-subconta", metodo: "cartao" }),
    );
    expect(repo.setCardDonationLink).toHaveBeenCalled();
  });

  it("recusa documento inválido antes de qualquer chamada de rede", async () => {
    const { provider, service } = build();

    const err = await erroDe(service.submitRegistration(ADMIN, { ...CADASTRO, documento: "111" }));

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(provider.createAccount).not.toHaveBeenCalled();
  });

  it("pessoa física sem data de nascimento não passa", async () => {
    const { service } = build();

    const err = await erroDe(
      service.submitRegistration(ADMIN, { ...CADASTRO, documento: "529.982.247-25" }),
    );

    expect(isAppError(err) && err.message).toMatch(/nascimento/i);
  });

  it("não reabre cadastro de conta já aprovada", async () => {
    const { provider, service } = build({ atual: conta({ status: "aprovada" }) });

    const err = await erroDe(service.submitRegistration(ADMIN, CADASTRO));

    expect(isAppError(err) && err.code).toBe("conflict");
    expect(provider.createAccount).not.toHaveBeenCalled();
  });

  it("member não configura recebimento", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.submitRegistration({ ...ADMIN, role: "member" }, CADASTRO));

    expect(isAppError(err) && err.code).toBe("forbidden");
    expect(repo.saveRegistration).not.toHaveBeenCalled();
  });

  it("igreja de outra empresa não é encontrada", async () => {
    const { repo, service } = build();

    const err = await erroDe(service.submitRegistration(ADMIN, { ...CADASTRO, churchId: OUTRA }));

    expect(isAppError(err) && err.code).toBe("not_found");
    expect(repo.saveRegistration).not.toHaveBeenCalled();
  });
});

describe("setCardEnabled", () => {
  it("liga o cartão quando a conta está aprovada e o link existe", async () => {
    const { repo, service } = build({
      atual: conta({ status: "aprovada", linkDoacaoCartao: "https://pagamento.exemplo/doar" }),
    });

    await service.setCardEnabled(ADMIN, IGREJA, true);

    expect(repo.setAceitaCartao).toHaveBeenCalledWith(EMPRESA, IGREJA, true);
  });

  it("não deixa ligar o cartão sem o provedor ter aprovado", async () => {
    const { repo, service } = build({ atual: conta({ status: "em_analise" }) });

    const err = await erroDe(service.setCardEnabled(ADMIN, IGREJA, true));

    expect(isAppError(err) && err.message).toMatch(/aprovar a conta/i);
    expect(repo.setAceitaCartao).not.toHaveBeenCalled();
  });

  it("desligar sempre pode: é a igreja tirando o botão da página dela", async () => {
    const { repo, service } = build({ atual: conta({ status: "suspensa", aceitaCartao: true }) });

    await service.setCardEnabled(ADMIN, IGREJA, false);

    expect(repo.setAceitaCartao).toHaveBeenCalledWith(EMPRESA, IGREJA, false);
  });
});

describe("syncStatus", () => {
  it("traz a decisão do provedor e cria o link quando aprova", async () => {
    const { repo, service } = build({ atual: conta({ status: "em_analise" }) });

    const status = await service.syncStatus(ADMIN, IGREJA);

    expect(status).toBe("aprovada");
    expect(repo.updateStatus).toHaveBeenCalledWith(IGREJA, "aprovada");
    expect(repo.setCardDonationLink).toHaveBeenCalled();
  });

  it("sem cadastro enviado, não há o que sincronizar", async () => {
    const { service } = build({ atual: conta({ externalAccountId: null }) });

    const err = await erroDe(service.syncStatus(ADMIN, IGREJA));

    expect(isAppError(err) && err.code).toBe("not_found");
  });
});

describe("webhook de doação", () => {
  function storeComDoacao(statusAtual: string | null) {
    const store: DonationStore = {
      findAccountByExternalId: vi.fn(async () => ({ churchId: IGREJA, webhookTokenHash: "h" })),
      upsertDonation: vi.fn(async () => undefined),
      findDonationStatus: vi.fn(async () => statusAtual),
    };
    return { store, service: createDonationWebhookService({ store, log: { warn: vi.fn() } }) };
  }

  const evento = {
    kind: "donation" as const,
    provider: "fake",
    donation: {
      externalPaymentId: "pay_1",
      amountCents: 5000,
      metodo: "cartao" as const,
      status: "recebida" as const,
      pagaEm: "2026-09-24T12:00:00.000Z",
      externalReference: null,
      netAmountCents: null,
    },
  };

  it("grava a doação sem nada sobre quem doou", async () => {
    const { store, service } = storeComDoacao(null);

    expect(await service.apply(evento, IGREJA)).toBe("applied");
    expect(store.upsertDonation).toHaveBeenCalledWith({
      churchId: IGREJA,
      provider: "fake",
      externalPaymentId: "pay_1",
      amountCents: 5000,
      metodo: "cartao",
      status: "recebida",
      pagaEm: "2026-09-24T12:00:00.000Z",
    });
  });

  it("evento atrasado não rebaixa doação já recebida", async () => {
    const { store, service } = storeComDoacao("recebida");

    const resultado = await service.apply(
      { ...evento, donation: { ...evento.donation, status: "pendente" } },
      IGREJA,
    );

    expect(resultado).toBe("stale");
    expect(store.upsertDonation).not.toHaveBeenCalled();
  });

  it("estorno depois do pagamento é aplicado", async () => {
    const { store, service } = storeComDoacao("recebida");

    await service.apply(
      { ...evento, donation: { ...evento.donation, status: "estornada" } },
      IGREJA,
    );

    expect(store.upsertDonation).toHaveBeenCalledWith(
      expect.objectContaining({ status: "estornada" }),
    );
  });

  it("evento que não é doação passa batido", async () => {
    const { store, service } = storeComDoacao(null);

    expect(await service.apply({ kind: "ignored", provider: "fake" }, IGREJA)).toBe("ignored");
    expect(store.upsertDonation).not.toHaveBeenCalled();
  });
});
