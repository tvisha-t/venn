import { NextResponse } from "next/server";
import { requireSession } from "@/server/session";
import { HttpError, route, throttle } from "@/server/http";
import { goalMatches } from "@/server/agent/orchestrator";

export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  throttle(req);
  const s = await requireSession();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "Goal not found");
  const r = await goalMatches(id, s.profileId);
  if (!r) throw new HttpError(404, "Goal not found");
  return NextResponse.json(r);
});
