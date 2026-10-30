import { handlePaymentWebhook } from "@/server/paymentWebhook";

/** URL antiga, mantida para webhooks já cadastrados. A nova é /api/webhooks/[gateway]. */
export async function POST(request: Request) {
  return handlePaymentWebhook(request);
}
