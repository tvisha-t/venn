import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { route, throttle } from "@/server/http";
import { getEvent } from "@/server/events";

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireSession();
  return NextResponse.json(await getEvent(s.profileId, (await ctx.params).id));
});
