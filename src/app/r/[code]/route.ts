import type { NextRequest } from "next/server";
import { handleReferralClick } from "@/modules/resellers/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  return handleReferralClick(request, code);
}
