import { describe, expect, it } from "vitest";
import { addMonths, todayInBillingZone } from "./billingDates";

describe("todayInBillingZone", () => {
  it("usa o dia de Brasília, não o de UTC", () => {
    // 01h UTC do dia 17 ainda é dia 16 em São Paulo.
    expect(todayInBillingZone(new Date("2026-09-17T01:00:00Z"))).toBe("2026-09-16");
    expect(todayInBillingZone(new Date("2026-09-17T15:00:00Z"))).toBe("2026-09-17");
  });
});

describe("addMonths", () => {
  it("mantém o dia quando existe", () => {
    expect(addMonths("2026-09-17", 1)).toBe("2026-10-17");
    expect(addMonths("2026-12-05", 1)).toBe("2027-01-05");
  });

  it("encosta no último dia de meses curtos", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });
});
