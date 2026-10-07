import { describe, expect, it } from "vitest";
import { createViaCepProvider } from "./viaCepProvider";

const responde = (corpo: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(corpo), { status })) as unknown as typeof fetch;

describe("viaCepProvider", () => {
  it("devolve o endereço do CEP", async () => {
    const urls: string[] = [];
    const buscar = (async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({ logradouro: "Rua das Flores", bairro: "Centro", localidade: "Bauru", uf: "sp" }),
      );
    }) as unknown as typeof fetch;
    await expect(createViaCepProvider(buscar).buscar("17012345")).resolves.toEqual({
      logradouro: "Rua das Flores",
      bairro: "Centro",
      cidade: "Bauru",
      uf: "SP",
    });
    expect(urls).toEqual(["https://viacep.com.br/ws/17012345/json/"]);
  });

  it("CEP geral de cidade pequena vem sem rua nem bairro", async () => {
    const r = await createViaCepProvider(responde({ logradouro: "", bairro: "", localidade: "Borá", uf: "SP" })).buscar(
      "19740000",
    );
    expect(r).toEqual({ logradouro: "", bairro: "", cidade: "Borá", uf: "SP" });
  });

  it("CEP que não existe devolve null", async () => {
    await expect(createViaCepProvider(responde({ erro: true })).buscar("00000000")).resolves.toBeNull();
    await expect(createViaCepProvider(responde({ erro: "true" })).buscar("00000000")).resolves.toBeNull();
  });

  it("provedor fora do ar ou resposta torta lança", async () => {
    await expect(createViaCepProvider(responde({}, 502)).buscar("17012345")).rejects.toThrow();
    await expect(createViaCepProvider(responde({ localidade: "Bauru" })).buscar("17012345")).rejects.toThrow();
    await expect(createViaCepProvider(responde(null)).buscar("17012345")).rejects.toThrow();
  });

  it("corta texto longo demais vindo de fora", async () => {
    const r = await createViaCepProvider(
      responde({ logradouro: "x".repeat(500), bairro: "y".repeat(500), localidade: "Bauru", uf: "SP" }),
    ).buscar("17012345");
    expect(r?.logradouro).toHaveLength(160);
    expect(r?.bairro).toHaveLength(80);
  });
});
