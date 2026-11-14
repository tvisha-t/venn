import { NextResponse } from "next/server";
import { requireAlum } from "@/server/roles";
import { route, throttle } from "@/server/http";
import { setRsvp } from "@/server/events";

// Only the member themselves can add or remove their own RSVP.
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireAlum();
  return NextResponse.json(await setRsvp(s.profileId, (await ctx.params).id, true));
});

export const DELETE = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireAlum();
  return NextResponse.json(await setRsvp(s.profileId, (await ctx.params).id, false));
});
