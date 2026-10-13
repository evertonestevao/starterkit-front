/** EBD → Revistas: pedidos de revista por trimestre (pagamento e entrega). */

export type FormaDePagamentoDaRevista = "dinheiro" | "pix" | "outro";

export interface EbdRevista {
  id: string;
  titulo: string;
  precoCentavos: number;
  /** Classe que costuma usar esta revista (sugestão no pedido). */
  classeId: string | null;
  classeNome: string | null;
}

export interface EbdRevistaItem {
  revistaId: string;
  titulo: string;
  quantidade: number;
  /** Preço da revista no dia do pedido. */
  precoCentavos: number;
}

export interface EbdRevistaPagamento {
  id: string;
  valorCentavos: number;
  data: string;
  forma: FormaDePagamentoDaRevista;
}

export interface EbdRevistaPedido {
  id: string;
  /** null = pessoa de fora do cadastro (só nome e telefone). */
  membroId: string | null;
  nome: string;
  telefone: string | null;
  deFora: boolean;
  /** Classe em que a pessoa está matriculada hoje, se estiver. */
  classeNome: string | null;
  observacao: string | null;
  entregueEm: string | null;
  cancelado: boolean;
  criadoEm: string;
  itens: EbdRevistaItem[];
  pagamentos: EbdRevistaPagamento[];
}

/** Matriculado hoje que ainda não pediu revista no trimestre. */
export interface EbdSemPedido {
  membroId: string;
  nome: string;
  classeId: string;
  classeNome: string;
}

export interface EbdRevistasDoTrimestre {
  revistas: EbdRevista[];
  pedidos: EbdRevistaPedido[];
  semPedido: EbdSemPedido[];
}
