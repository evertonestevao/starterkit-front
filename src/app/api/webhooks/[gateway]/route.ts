import { getPaymentGateway } from "@/adapters/payment";
import { handlePaymentWebhook } from "@/server/paymentWebhook";

/** Só o gateway ativo recebe evento; outro nome nem chega ao adapter. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ gateway: string }> },
) {
  const { gateway } = await params;
  if (gateway !== getPaymentGateway().name) {
    return Response.json({ error: "Não encontrado" }, { status: 404 });
  }
  return handlePaymentWebhook(request);
}
