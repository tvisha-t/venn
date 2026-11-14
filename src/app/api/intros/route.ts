import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { listIntros } from "@/server/intros";

export const GET = route(async (req: Request) => {
  throttle(req);
  const s = await requireSession();
  return NextResponse.json({ intros: await listIntros(s.profileId) });
});
