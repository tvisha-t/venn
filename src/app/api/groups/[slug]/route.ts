import { NextResponse } from "next/server";
import { route, throttle } from "@/server/http";
import { requireAlum } from "@/server/roles";
import { getGroup } from "@/server/groups";

export const GET = route(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  throttle(req);
  const s = await requireAlum();
  return NextResponse.json(await getGroup(s.profileId, (await ctx.params).slug), { headers: { "cache-control": "no-store" } });
});
