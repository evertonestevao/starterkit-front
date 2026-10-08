/** Vendas antecipadas (camiseta, pastel, lanche) pela página da igreja. */

export type StatusVenda = "ativa" | "encerrada";
export type StatusPedido = "pendente" | "pago" | "cancelado";

/** Como a venda aparece para quem cuida dela no painel. */
export interface Venda {
  id: string;
  titulo: string;
  descricao: string | null;
  precoCents: number;
  pixChave: string;
  pixTitular: string;
  /** Null = a chave ainda espera a confirmação do Responsável (a venda não aparece na página). */
  pixConfirmadoEm: string | null;
  /** AAAA-MM-DD: aceita pedidos até o fim desse dia. */
  encerraEm: string | null;
  estoque: number | null;
  maxPorPedido: number | null;
  status: StatusVenda;
  createdAt: string;
}

export interface PedidoVenda {
  id: string;
  vendaId: string;
  nome: string;
  telefone: string;
  quantidade: number;
  precoUnitarioCents: number;
  totalCents: number;
  observacao: string | null;
  status: StatusPedido;
  createdAt: string;
}

/** O que o formulário do painel envia (já convertido). */
export interface VendaInput {
  titulo: string;
  descricao: string | null;
  precoCents: number;
  pixChave: string;
  pixTitular: string;
  encerraEm: string | null;
  estoque: number | null;
  maxPorPedido: number | null;
}

/** Venda aberta, como a página pública vê (sem a chave Pix). */
export interface VendaPublica {
  id: string;
  titulo: string;
  descricao: string | null;
  precoCents: number;
  encerraEm: string | null;
  maxPorPedido: number | null;
  /** Unidades que ainda dá para pedir; null = sem limite de estoque. */
  disponivel: number | null;
}
