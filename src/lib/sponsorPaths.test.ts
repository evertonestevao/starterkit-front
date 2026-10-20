import { describe, expect, it } from "vitest";
import { safeSponsorPath, sponsorshipPath } from "./sponsorPaths";

describe("safeSponsorPath", () => {
  it("aceita caminhos da área, com query", () => {
    expect(safeSponsorPath("/patrocinador")).toBe("/patrocinador");
    expect(safeSponsorPath("/patrocinador/patrocinar/betel?x=1")).toBe(
      "/patrocinador/patrocinar/betel?x=1",
    );
  });

  it("recusa tudo que sai da área", () => {
    for (const value of [
      "/dashboard",
      "/patrocinadores",
      "https://evil.com/patrocinador",
      "//evil.com/patrocinador",
      "/patrocinador\..\dashboard",
      undefined,
      42,
    ]) {
      expect(safeSponsorPath(value)).toBe("/patrocinador");
    }
  });

  it("monta o link de patrocínio escapando o código", () => {
    expect(sponsorshipPath("betel lins")).toBe("/patrocinador/patrocinar/betel%20lins");
  });
});
