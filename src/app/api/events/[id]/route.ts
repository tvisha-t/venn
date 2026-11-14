import { NextResponse } from "next/server";
import { requireAlum } from "@/server/roles";
import { route, throttle } from "@/server/http";
import { getEvent } from "@/server/events";

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireAlum();
  return NextResponse.json(await getEvent(s.profileId, (await ctx.params).id));
});
