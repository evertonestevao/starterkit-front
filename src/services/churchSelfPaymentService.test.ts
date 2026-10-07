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
};

function build() {
  const repo: ChurchSelfPaymentRepository = {
    getStatus: vi.fn(async () => STATUS_ATIVO),
    enable: vi.fn(async () => ACCOUNT),
    setAceitaPatrocinio: vi.fn(async () => {}),
  };
  const biller: SelfPaymentBiller = {
    syncBilling: vi.fn(async () => ({ invoiceUrl: null, syncPending: false })),
  };
  return { repo, biller, service: createChurchSelfPaymentService({ repo, biller }) };
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
