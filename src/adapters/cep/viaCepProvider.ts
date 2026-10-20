import type { CepProvider, EnderecoDoCep } from "./CepProvider";

/**
 * ViaCEP (https://viacep.com.br): gratuito, sem chave. Não tem garantia de
 * disponibilidade — por isso o tempo limite curto: preencher o endereço é
 * uma conveniência, e a tela segue funcionando sem ela.
 */
const TEMPO_LIMITE_MS = 4000;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function createViaCepProvider(buscarUrl: typeof fetch = fetch): CepProvider {
  return {
    name: "viacep",

    async buscar(cep: string): Promise<EnderecoDoCep | null> {
      const resposta = await buscarUrl(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        // Endereço de um CEP quase não muda: o Next pode reaproveitar por um dia.
        next: { revalidate: 86_400 },
      });
      if (!resposta.ok) throw new Error(`ViaCEP respondeu ${resposta.status}`);
      const dados: unknown = await resposta.json();
      if (typeof dados !== "object" || dados === null) throw new Error("ViaCEP devolveu resposta inesperada");
      const r = dados as Record<string, unknown>;
      // CEP com formato válido que não existe: 200 com { "erro": true } (ou "true").
      if (r.erro === true || r.erro === "true") return null;

      // O texto vem de fora: cortado nos mesmos limites da ficha do membro.
      const uf = texto(r.uf, 2).toUpperCase();
      const cidade = texto(r.localidade, 80);
      if (!cidade || !/^[A-Z]{2}$/.test(uf)) throw new Error("ViaCEP devolveu endereço sem cidade/UF");
      return { logradouro: texto(r.logradouro, 160), bairro: texto(r.bairro, 80), cidade, uf };
    },
  };
}
