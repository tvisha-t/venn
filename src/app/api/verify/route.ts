import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { verifyStatus } from "@/server/verification";

export const GET = route(async (req: Request) => {
  throttle(req, "auth");
  const s = await requireSession();
  return NextResponse.json(await verifyStatus(s.profileId), { headers: { "cache-control": "no-store" } });
});
