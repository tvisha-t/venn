import { NextResponse } from "next/server";
import { route, throttle } from "@/server/http";
import { requireAdmin, dashboard } from "@/server/admin";

export const GET = route(async (req: Request) => {
  throttle(req);
  await requireAdmin();
  return NextResponse.json(await dashboard());
});
