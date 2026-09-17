import { describe, expect, it } from "vitest";
import { publicSponsorshipSchema, sponsorSignupSchema } from "./schemas";

const base = {
  churchPublicCode: "esperanca",
  kind: "person" as const,
  displayName: "  Maria Souza ",
  document: "529.982.247-25",
  phone: "(14) 99999-8888",
  email: "  Maria@Exemplo.COM ",
  acceptTerms: true as const,
  emailConsent: false,
};

describe("publicSponsorshipSchema", () => {
  it("limpa email, documento, telefone e nome", () => {
    const parsed = publicSponsorshipSchema.parse(base);
    expect(parsed).toMatchObject({
      email: "maria@exemplo.com",
      document: "52998224725",
      phone: "14999998888",
      displayName: "Maria Souza",
    });
  });

  it("mantém a regra de documento por tipo depois de estender o schema", () => {
    const result = publicSponsorshipSchema.safeParse({ ...base, kind: "business" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("CNPJ inválido");
  });

  it("exige o aceite dos termos", () => {
    const result = publicSponsorshipSchema.safeParse({ ...base, acceptTerms: false });
    expect(result.success).toBe(false);
  });

  it("telefone é opcional e vira null", () => {
    const parsed = publicSponsorshipSchema.parse({ ...base, phone: "" });
    expect(parsed.phone).toBeNull();
  });

  it("o schema de cadastro logado segue valendo sozinho", () => {
    expect(
      sponsorSignupSchema.safeParse({
        kind: "business",
        displayName: "Padaria",
        document: "11.222.333/0001-81",
        phone: "",
      }).success,
    ).toBe(true);
  });
});
