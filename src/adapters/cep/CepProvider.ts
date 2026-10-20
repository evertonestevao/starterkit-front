/**
 * Interface única de consulta de endereço por CEP. Cada provedor (ViaCEP,
 * BrasilAPI, Correios...) implementa em src/adapters/cep — services nunca
 * chamam API de provedor direto.
 */

export interface EnderecoDoCep {
  /** Vazio em CEP geral de cidade pequena (só cidade e UF). */
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface CepProvider {
  readonly name: string;
  /**
   * `cep` são 8 dígitos. Devolve null quando o CEP não existe; lança quando o
   * provedor está fora do ar ou respondeu algo que não deu para entender.
   */
  buscar(cep: string): Promise<EnderecoDoCep | null>;
}
