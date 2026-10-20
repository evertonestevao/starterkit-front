import { describe, expect, it } from "vitest";
import { sniffImageType } from "./imageValidation";

function bytes(...valores: number[]): Uint8Array {
  return new Uint8Array(valores);
}

describe("sniffImageType", () => {
  it("reconhece PNG, JPEG e WebP pela assinatura", () => {
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe(
      "image/png",
    );
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("image/jpeg");
    expect(
      sniffImageType(
        bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50),
      ),
    ).toBe("image/webp");
  });

  it("recusa SVG — é XML com script, e o bucket serve na própria origem", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(sniffImageType(svg)).toBeNull();
  });

  it("recusa HTML disfarçado de imagem", () => {
    expect(sniffImageType(new TextEncoder().encode("<!DOCTYPE html><html>"))).toBeNull();
  });

  it("recusa arquivo vazio ou curto demais para ter assinatura", () => {
    expect(sniffImageType(bytes())).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull();
  });

  it("não se deixa enganar por RIFF que não é WebP (um .wav, por exemplo)", () => {
    expect(
      sniffImageType(
        bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45),
      ),
    ).toBeNull();
  });
});
