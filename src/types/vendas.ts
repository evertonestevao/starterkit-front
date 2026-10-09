/** Vendas antecipadas (camiseta, pastel, lanche) pela página da igreja. */

export type StatusVenda = "ativa" | "encerrada";
export type StatusPedido = "pendente" | "pago" | "cancelado";

/** Opção de uma venda: sabor, tamanho... */
export interface VendaOpcao {
  id: string;
  nome: string;
  /** Null = o preço da venda. */
  precoCents: number | null;
}

/** Como a venda aparece para quem cuida dela no painel. */
export interface Venda {
  id: string;
  titulo: string;
  descricao: string | null;
  precoCents: number;
  pixChave: string;
  pixTitular: string;
  /** WhatsApp (só dígitos) para onde quem compra manda o comprovante; null = a venda não pede. */
  whatsappComprovante: string | null;
  /** Null = a chave ainda espera a confirmação do Responsável (a venda não aparece na página). */
  pixConfirmadoEm: string | null;
  /** AAAA-MM-DD: aceita pedidos até o fim desse dia. */
  encerraEm: string | null;
  estoque: number | null;
  maxPorPedido: number | null;
  status: StatusVenda;
  createdAt: string;
  /** Quem compra escolhe a quantidade de cada opção. */
  temOpcoes: boolean;
  /** As opções ativas, na ordem da tela. */
  opcoes: VendaOpcao[];
}

/** Um item do pedido: a opção (ou a venda, sem opções), com nome e preço do momento. */
export interface ItemPedido {
  nome: string;
  quantidade: number;
  precoUnitarioCents: number;
  totalCents: number;
}

export interface PedidoVenda {
  id: string;
  vendaId: string;
  nome: string;
  telefone: string;
  /** Soma das unidades de todos os itens. */
  quantidade: number;
  totalCents: number;
  observacao: string | null;
  status: StatusPedido;
  createdAt: string;
  itens: ItemPedido[];
}

/** O que o formulário do painel envia (já convertido). */
export interface VendaInput {
  titulo: string;
  descricao: string | null;
  precoCents: number;
  pixChave: string;
  pixTitular: string;
  whatsappComprovante: string | null;
  encerraEm: string | null;
  estoque: number | null;
  maxPorPedido: number | null;
  temOpcoes: boolean;
  /** `id` nulo = opção nova. */
  opcoes: Array<{ id: string | null; nome: string; precoCents: number | null }>;
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
  temOpcoes: boolean;
  /** Com o preço que vale (o próprio ou o da venda). */
  opcoes: Array<{ id: string; nome: string; precoCents: number }>;
}
