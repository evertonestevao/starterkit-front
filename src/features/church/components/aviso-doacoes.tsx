/**
 * A plataforma não toca no dinheiro das doações. Fica nas telas que falam de
 * dízimo, oferta e doação (campanhas, Pix, recebimento): é a pergunta que
 * toda igreja faz, e a resposta não deve depender de alguém ter lido os Termos.
 */
export function AvisoDoacoes() {
  return (
    <p className="mb-4 rounded-lg border border-dashed px-3 py-2 text-xs leading-5 text-muted-foreground">
      Dízimos e ofertas vão direto do banco de quem doa para a conta da igreja. A plataforma não recebe, não
      repassa e não cobra taxa sobre doação.
    </p>
  );
}
