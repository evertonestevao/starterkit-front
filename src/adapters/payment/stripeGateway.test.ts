import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeStripeEvent, verifyStripeSignature } from "./stripeGateway";

const SECRET = "whsec_test";

function sign(payload: string, timestamp: number): string {
  const mac = createHmac("sha256", SECRET).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

describe("verifyStripeSignature", () => {
  const payload = '{"id":"evt_1"}';
  const now = 1_750_000_000;

  it("aceita assinatura válida dentro da tolerância", async () => {
    expect(await verifyStripeSignature(payload, sign(payload, now), SECRET, now)).toBe(true);
  });

  it("rejeita assinatura de outro secret", async () => {
    const forged = `t=${now},v1=${createHmac("sha256", "outro").update(`${now}.${payload}`).digest("hex")}`;
    expect(await verifyStripeSignature(payload, forged, SECRET, now)).toBe(false);
  });

  it("rejeita payload adulterado", async () => {
    expect(
      await verifyStripeSignature('{"id":"evt_2"}', sign(payload, now), SECRET, now),
    ).toBe(false);
  });

  it("rejeita timestamp fora da tolerância (replay)", async () => {
    const old = now - 301;
    expect(await verifyStripeSignature(payload, sign(payload, old), SECRET, now)).toBe(false);
  });

  it("rejeita header malformado", async () => {
    expect(await verifyStripeSignature(payload, "garbage", SECRET, now)).toBe(false);
    expect(await verifyStripeSignature(payload, "", SECRET, now)).toBe(false);
  });
});

describe("normalizeStripeEvent", () => {
  it("normaliza customer.subscription.created para subscription.activated", () => {
    const event = normalizeStripeEvent({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          metadata: { company_id: "company-1", plan_id: "plan-pro" },
          cancel_at_period_end: false,
          items: {
            data: [{ current_period_start: 1_750_000_000, current_period_end: 1_752_592_000 }],
          },
        },
      },
    });
    expect(event).toMatchObject({
      type: "subscription.activated",
      gateway: "stripe",
      externalSubscriptionId: "sub_123",
      externalCustomerId: "cus_123",
      companyId: "company-1",
      planId: "plan-pro",
    });
    expect(event.currentPeriodEnd).toBe(new Date(1_752_592_000 * 1000).toISOString());
  });

  it("usa object.subscription como id externo em eventos de invoice", () => {
    const event = normalizeStripeEvent({
      type: "invoice.payment_failed",
      data: { object: { id: "in_123", subscription: "sub_123", customer: "cus_123" } },
    });
    expect(event.type).toBe("payment.failed");
    expect(event.externalSubscriptionId).toBe("sub_123");
  });

  it("mapeia tipo desconhecido para ignored", () => {
    expect(normalizeStripeEvent({ type: "charge.succeeded" }).type).toBe("ignored");
  });
});
