import type { NextRequest } from "next/server";
import { exportCommissions } from "@/modules/resellers/admin/export-route";

export async function GET(request: NextRequest) {
  return exportCommissions(request);
}
