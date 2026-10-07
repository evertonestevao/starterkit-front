import { describe, expect, it, vi } from "vitest";
import { isAppError } from "@/lib/errors";
import type { SponsorAccount } from "@/types/sponsorship";
import {
  createChurchSelfPaymentService,
  isSelfPaymentBillable,
  type ChurchSelfPaymentRepository,
  type ChurchSelfPaymentStatus,
  type SelfPaymentBiller,
} from "./churchSelfPaymentService";

const CHURCH = "church-1";

const ACCOUNT: SponsorAccount = {
  id: "acc-1",
  user_id: null,
  church_id: CHURCH,
  company_id: "co-1",
  is_self_payment: true,
  kind: "person",
  display_name: "Igreja X",
  email: "igreja@exemplo.com",
  phone: null,
  document: "11144477735",
  logo_url: null,
  visible_on_page: true,
  link_tipo: null,
  link_valor: null,
  gateway: null,
  gateway_customer_id: null,
  gateway_subscription_id: null,
  billing_status: "none",
  billed_amount_cents: null,
  billing_sync_status: "synced",
  billing_synced_at: null,
  next_due_date: null,
  security_hold_at: null,
  deleted_at: null,
  created_at: "2026-09-24T00:00:00Z",
  updated_at: "2026-09-24T00:00:00Z",
};

const STATUS_ATIVO: ChurchSelfPaymentStatus = {
  realSponsorCount: 0,
  account: ACCOUNT,
  sponsorshipStatus: "pending_payment",
  endsAt: null,
  aceitaPatrocinio: true,
  amountCents: 3990,
  openInvoiceUrl: null,
  paymentMethod: "card",
  needsAuthorization: false,
  pixDisponivel: false,
};

function build(pixDisponivel = false) {
  const repo: ChurchSelfPaymentRepository = {
    getStatus: vi.fn(async () => STATUS_ATIVO),
    enable: vi.fn(async () => ACCOUNT),
    setPaymentMethod: vi.fn(async () => ACCOUNT.id),
    pendencias: vi.fn(async () => []),
    bloqueada: vi.fn(async () => false),
    setAceitaPatrocinio: vi.fn(async () => {}),
  };
  const biller: SelfPaymentBiller = {
    syncBilling: vi.fn(async () => ({ invoiceUrl: null, syncPending: false })),
    restartSelfPayment: vi.fn(async () => ({ invoiceUrl: null, syncPending: false })),
  };
  return { repo, biller, service: createChurchSelfPaymentService({ repo, biller, pixDisponivel }) };
}

const INPUT_VALIDO = {
  kind: "person",
  displayName: "Pastor da Igreja",
  email: "igreja@exemplo.com",
  phone: "",
  document: "111.444.777-35",
};

async function erroDe(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error("esperava erro");
}

describe("isSelfPaymentBillable", () => {
  it("cobrável é pending_payment e active; o resto não", () => {
    expect(isSelfPaymentBillable("pending_payment")).toBe(true);
    expect(isSelfPaymentBillable("active")).toBe(true);
    expect(isSelfPaymentBillable("cancel_scheduled")).toBe(false);
    expect(isSelfPaymentBillable("canceled")).toBe(false);
    expect(isSelfPaymentBillable(null)).toBe(false);
  });
});

describe("enable", () => {
  it("grava a conta, sincroniza a cobrança e devolve o status atualizado", async () => {
    const { repo, biller, service } = build();

    const { status, invoiceUrl } = await service.enable(CHURCH, INPUT_VALIDO);

    expect(repo.enable).toHaveBeenCalledWith(
      expect.objectContaining({ churchId: CHURCH, kind: "person", document: "11144477735" }),
    );
    expect(biller.syncBilling).toHaveBeenCalledWith("acc-1", { createIfMissing: true });
    expect(status).toEqual(STATUS_ATIVO);
    expect(invoiceUrl).toBeNull();
  });

  it("devolve a página do cartão e manda o endereço de volta ao provedor", async () => {
    const { biller, service } = build();
    vi.mocked(biller.syncBilling).mockResolvedValueOnce({
      invoiceUrl: "https://pagamento.test/i/123",
      syncPending: false,
    });
    const r = await service.enable(CHURCH, INPUT_VALIDO, { successUrl: "https://app.test/dashboard/mensalidade" });
    expect(r.invoiceUrl).toBe("https://pagamento.test/i/123");
    expect(biller.syncBilling).toHaveBeenCalledWith("acc-1", {
      createIfMissing: true,
      successUrl: "https://app.test/dashboard/mensalidade",
    });
  });

  it("recusa CPF/CNPJ inválido antes de tocar o banco", async () => {
    const { repo, biller, service } = build();

    const err = await erroDe(service.enable(CHURCH, { ...INPUT_VALIDO, document: "111.111.111-11" }));

    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.enable).not.toHaveBeenCalled();
    expect(biller.syncBilling).not.toHaveBeenCalled();
  });

  it("recusa nome curto, email inválido ou telefone quebrado", async () => {
    const { repo, service } = build();

    for (const ruim of [
      { ...INPUT_VALIDO, displayName: "A" },
      { ...INPUT_VALIDO, email: "não é email" },
      { ...INPUT_VALIDO, phone: "123" },
    ]) {
      const err = await erroDe(service.enable(CHURCH, ruim));
      expect(isAppError(err) && err.code).toBe("validation_error");
    }
    expect(repo.enable).not.toHaveBeenCalled();
  });
});

describe("setAceitaPatrocinio", () => {
  it("repassa ao repositório", async () => {
    const { repo, service } = build();
    await service.setAceitaPatrocinio(CHURCH, false);
    expect(repo.setAceitaPatrocinio).toHaveBeenCalledWith(CHURCH, false);
  });

  it("recusa valor que não é booleano", async () => {
    const { repo, service } = build();
    const err = await erroDe(service.setAceitaPatrocinio(CHURCH, "sim"));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.setAceitaPatrocinio).not.toHaveBeenCalled();
  });
});

describe("forma de pagamento", () => {
  const PIX = { payload: "00020126...", expiresAt: "2026-10-08T15:00:00.000Z" };

  it("sem escolher, é cartão", async () => {
    const { repo, service } = build();
    await service.enable(CHURCH, INPUT_VALIDO);
    expect(repo.setPaymentMethod).toHaveBeenCalledWith(CHURCH, "card");
  });

  it("Pix Automático: grava a forma e devolve o QR Code", async () => {
    const { repo, biller, service } = build(true);
    vi.mocked(biller.syncBilling).mockResolvedValueOnce({ invoiceUrl: null, syncPending: false, pix: PIX });
    const r = await service.enable(CHURCH, INPUT_VALIDO, { method: "pix_automatico" });
    expect(repo.setPaymentMethod).toHaveBeenCalledWith(CHURCH, "pix_automatico");
    expect(r.pix).toEqual(PIX);
    expect(r.invoiceUrl).toBeNull();
    expect(r.status.pixDisponivel).toBe(true);
  });

  it("Pix pedido quando o provedor não oferece é recusado antes de gravar qualquer coisa", async () => {
    const { repo, biller, service } = build(false);
    const err = await erroDe(service.enable(CHURCH, INPUT_VALIDO, { method: "pix_automatico" }));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.enable).not.toHaveBeenCalled();
    expect(biller.syncBilling).not.toHaveBeenCalled();
  });

  it("forma desconhecida é recusada", async () => {
    const { repo, service } = build(true);
    const err = await erroDe(service.enable(CHURCH, INPUT_VALIDO, { method: "boleto" }));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.enable).not.toHaveBeenCalled();
  });

  it("conta que já tem cobrança recorrente não troca de forma no recadastro", async () => {
    const { repo, service } = build(true);
    vi.mocked(repo.enable).mockResolvedValueOnce({ ...ACCOUNT, gateway_subscription_id: "sub_1" });
    await service.enable(CHURCH, INPUT_VALIDO, { method: "pix_automatico" });
    expect(repo.setPaymentMethod).not.toHaveBeenCalled();
  });
});

describe("retomar", () => {
  const PIX = { payload: "00020126...", expiresAt: null };

  it("QR Code vencido: gera outro na mesma forma", async () => {
    const { repo, biller, service } = build(true);
    vi.mocked(repo.getStatus).mockResolvedValue({ ...STATUS_ATIVO, paymentMethod: "pix_automatico" });
    vi.mocked(biller.restartSelfPayment).mockResolvedValueOnce({ invoiceUrl: null, syncPending: false, pix: PIX });
    const r = await service.retomar(CHURCH, "pix_automatico", { successUrl: "https://app.test/volta" });
    expect(biller.restartSelfPayment).toHaveBeenCalledWith(ACCOUNT.id, { successUrl: "https://app.test/volta" });
    expect(r.pix).toEqual(PIX);
  });

  it("valor mudou (sem cobrança no provedor): pode escolher a outra forma", async () => {
    const { repo, biller, service } = build(true);
    vi.mocked(repo.getStatus).mockResolvedValue({
      ...STATUS_ATIVO,
      sponsorshipStatus: "active",
      paymentMethod: "pix_automatico",
      needsAuthorization: true,
    });
    await service.retomar(CHURCH, "card");
    expect(repo.setPaymentMethod).toHaveBeenCalledWith(CHURCH, "card");
    expect(biller.restartSelfPayment).toHaveBeenCalled();
  });

  it("quem já está em dia não recomeça", async () => {
    const { repo, biller, service } = build(true);
    vi.mocked(repo.getStatus).mockResolvedValue({ ...STATUS_ATIVO, sponsorshipStatus: "active" });
    const err = await erroDe(service.retomar(CHURCH, "card"));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(biller.restartSelfPayment).not.toHaveBeenCalled();
  });

  it("com cobrança aberta numa forma, não troca para a outra", async () => {
    const { repo, biller, service } = build(true);
    vi.mocked(repo.getStatus).mockResolvedValue({ ...STATUS_ATIVO, paymentMethod: "card" });
    const err = await erroDe(service.retomar(CHURCH, "pix_automatico"));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(repo.setPaymentMethod).not.toHaveBeenCalled();
    expect(biller.restartSelfPayment).not.toHaveBeenCalled();
  });

  it("sem cadastro de quem paga, não há o que retomar", async () => {
    const { repo, biller, service } = build(true);
    vi.mocked(repo.getStatus).mockResolvedValue({ ...STATUS_ATIVO, account: null, sponsorshipStatus: null });
    const err = await erroDe(service.retomar(CHURCH, "card"));
    expect(isAppError(err) && err.code).toBe("validation_error");
    expect(biller.restartSelfPayment).not.toHaveBeenCalled();
  });
});
